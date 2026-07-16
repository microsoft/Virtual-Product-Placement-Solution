//
//  FrameDumper.swift
//  IOS.SDK.SampleBuffer
//
//  Debug-only utility for inspecting the Metal renderer's output offline.
//  Writes a bounded number of resolved output `CVPixelBuffer`s to disk as
//  PNGs and, if Photos `addOnly` authorization is granted, mirrors each one
//  into the Photos library so they can be browsed directly in the Photos app
//  on the phone.
//
//  Not used by default — `MetalRenderer.frameDumper` is `nil` unless the
//  host app explicitly attaches an instance (e.g. via
//  `renderer.enableFrameDump(directory:maxFrames:)`).
//

import IOSSDKCore
import CoreVideo
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import Photos

/// Bounded PNG dumper for `CVPixelBuffer` outputs. The first `maxFrames`
/// buffers handed to `dumpIfNeeded(_:)` are written to disk; subsequent calls
/// no-op. Thread affinity matches `MetalRenderer.renderToPixelBuffer` (which
/// runs on the SDK decode thread); PNG encode + Photos save both happen on
/// that thread (Photos save itself is async internally).
public final class FrameDumper {
    /// Directory PNG frames are written to. Existing `frame_*.png` files are
    /// removed at construction so old dumps don't pollute inspection.
    public let directory: URL
    /// Maximum number of frames to write. `dumpIfNeeded` is a no-op once this
    /// many frames have been dumped.
    public let maxFrames: Int

    private var dumpedFrameCount: Int = 0
    /// `true` once Photos `addOnly` authorization has been granted (cached so
    /// each frame doesn't re-query). Disk dumps still happen regardless; this
    /// only gates the optional Photos-library mirror.
    private var photoSaveAuthorized: Bool = false

    /// `true` once the configured budget has been used up.
    public var isFinished: Bool { dumpedFrameCount >= maxFrames }

    /// Create a dumper that writes up to `maxFrames` PNGs into `directory`.
    /// The directory is created if missing; pre-existing `frame_*.png` files
    /// inside it are removed. Also kicks off a Photos `addOnly` permission
    /// request — if granted, every dumped frame is additionally saved into
    /// the Photos library.
    ///
    /// The host app must declare `NSPhotoLibraryAddUsageDescription` in its
    /// Info.plist for the Photos mirror to work; disk dumps work regardless.
    public init(directory: URL, maxFrames: Int) {
        self.directory = directory
        self.maxFrames = max(0, maxFrames)

        dlog("📸 [FrameDumper] init dir=\(directory.path) maxFrames=\(self.maxFrames)")
        do {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true
            )
        } catch {
            dlog("❌ [FrameDumper] Failed to create dir: \(error)")
        }
        if let existing = try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        ) {
            for url in existing
            where url.lastPathComponent.hasPrefix("frame_") && url.pathExtension == "png" {
                try? FileManager.default.removeItem(at: url)
            }
        }

        let current = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch current {
        case .authorized, .limited:
            photoSaveAuthorized = true
            dlog("📸 [FrameDumper] Photos addOnly already authorized")
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
                let ok = (status == .authorized || status == .limited)
                self?.photoSaveAuthorized = ok
                dlog("📸 [FrameDumper] Photos addOnly authorization \(ok ? "granted" : "denied") (raw=\(status.rawValue))")
            }
        default:
            photoSaveAuthorized = false
            dlog("⚠️ [FrameDumper] Photos addOnly not authorized (status=\(current.rawValue)); dumps will only land on disk")
        }
    }

    /// Write the next frame if the budget allows. Caller must ensure the
    /// producing command buffer has completed before calling (so the IOSurface
    /// holds the GPU result).
    public func dumpIfNeeded(_ pixelBuffer: CVPixelBuffer) {
        guard dumpedFrameCount < maxFrames else { return }
        let index = dumpedFrameCount
        dumpedFrameCount += 1

        let url = directory.appendingPathComponent(
            String(format: "frame_%04d.png", index)
        )
        writePixelBufferAsPNG(pixelBuffer, to: url)

        if dumpedFrameCount == maxFrames {
            dlog("📸 [FrameDumper] Complete — wrote \(maxFrames) frame(s) to \(directory.path)")
        }
    }

    /// Encode a BGRA `CVPixelBuffer` to PNG at `url`, then mirror to Photos
    /// if authorized.
    private func writePixelBufferAsPNG(_ pixelBuffer: CVPixelBuffer, to url: URL) {
        let lockResult = CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        guard lockResult == kCVReturnSuccess else {
            dlog("❌ [FrameDumper] Failed to lock pixel buffer (\(lockResult))")
            return
        }
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            dlog("❌ [FrameDumper] Pixel buffer base address was nil")
            return
        }

        // The output pool produces BGRA. In CG terms that's
        // `byteOrder32Little | noneSkipFirst` (memory BGRA == word ARGB on LE,
        // and we don't have a meaningful alpha in the resolved color target).
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGBitmapInfo(rawValue:
            CGBitmapInfo.byteOrder32Little.rawValue |
            CGImageAlphaInfo.noneSkipFirst.rawValue
        )
        guard let context = CGContext(
            data: baseAddress,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: bitmapInfo.rawValue
        ), let cgImage = context.makeImage() else {
            dlog("❌ [FrameDumper] CGContext/makeImage failed")
            return
        }

        guard let dest = CGImageDestinationCreateWithURL(
            url as CFURL,
            UTType.png.identifier as CFString,
            1,
            nil
        ) else {
            dlog("❌ [FrameDumper] CGImageDestinationCreateWithURL failed for \(url.path)")
            return
        }
        CGImageDestinationAddImage(dest, cgImage, nil)
        guard CGImageDestinationFinalize(dest) else {
            dlog("❌ [FrameDumper] finalize failed for \(url.path)")
            return
        }
        dlog("📸 [FrameDumper] Wrote \(width)x\(height) frame -> \(url.path)")

        if photoSaveAuthorized {
            saveFileURLToPhotos(url)
        }
    }

    /// Add the PNG at `fileURL` to the Photos library as a new asset. Runs
    /// asynchronously; the caller's pixel buffer may be released immediately.
    private func saveFileURLToPhotos(_ fileURL: URL) {
        PHPhotoLibrary.shared().performChanges {
            let req = PHAssetCreationRequest.forAsset()
            let opts = PHAssetResourceCreationOptions()
            opts.shouldMoveFile = false
            opts.uniformTypeIdentifier = UTType.png.identifier
            req.addResource(with: .photo, fileURL: fileURL, options: opts)
        } completionHandler: { ok, err in
            if !ok {
                dlog("❌ [FrameDumper] Photos save failed for \(fileURL.lastPathComponent): \(err?.localizedDescription ?? "unknown")")
            }
        }
    }
}
