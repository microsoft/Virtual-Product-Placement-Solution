//
//  AdTextureLoader.swift
//  IOSSDKCore
//
//  Download → pad to `adUnitRatio` → mip-mapped MTLTexture.
//  Animated GIF / APNG / WebP yield a multi-frame timeline.
//

import Foundation
import Metal
import MetalKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

/// Decoded asset type (UTI + frame count).
public struct AdAssetKind: Sendable, CustomStringConvertible {
    public let uti: String?
    public let frameCount: Int

    public var isAnimated: Bool { frameCount > 1 }
    public var isGIF: Bool { uti == UTType.gif.identifier }

    public var description: String {
        "\(uti ?? "<unknown>") frames=\(frameCount)\(isAnimated ? " (animated)" : "")"
    }
}

/// One frame of an ad timeline. `pts` is cumulative seconds since frame 0.
public struct AdTextureFrame {
    public let pts: TimeInterval
    public let texture: MTLTexture

    public init(pts: TimeInterval, texture: MTLTexture) {
        self.pts = pts
        self.texture = texture
    }
}

/// Time-ordered timeline. Stills are 1 frame with `loopDuration == 0`;
/// animated assets carry N frames and `loopDuration = sum(delay)`.
public struct AdTextureTimeline {
    public let frames: [AdTextureFrame]
    public let loopDuration: TimeInterval

    public init(frames: [AdTextureFrame], loopDuration: TimeInterval) {
        self.frames = frames
        self.loopDuration = loopDuration
    }

    public var isAnimated: Bool { frames.count > 1 }
    public var baseTexture: MTLTexture? { frames.first?.texture }

    /// Floor lookup: last frame with `pts <= (t mod loopDuration)`.
    /// Stills short-circuit to `frames[0]`.
    public func frame(atRelativeTime t: TimeInterval) -> AdTextureFrame {
        guard isAnimated, loopDuration > 0 else {
            return frames[0]
        }
        var rem = t.truncatingRemainder(dividingBy: loopDuration)
        if rem < 0 { rem += loopDuration }
        // Binary search for largest index with frames[i].pts <= rem.
        var lo = 0
        var hi = frames.count - 1
        var best = 0
        while lo <= hi {
            let mid = (lo &+ hi) >> 1
            if frames[mid].pts <= rem {
                best = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return frames[best]
    }
}

@MainActor
public final class AdTextureLoader {

    private let device: MTLDevice
    private let textureLoader: MTKTextureLoader
    private let session: URLSession
    /// Reused for every blit pass that fills mip levels 1..N.
    private let mipmapQueue: MTLCommandQueue?

    public init(device: MTLDevice) {
        self.device = device
        self.textureLoader = MTKTextureLoader(device: device)
        self.mipmapQueue = device.makeCommandQueue()
        // `.ephemeral` alone keeps an in-memory URLCache that honors
        // CDN `Cache-Control`; null it out + force-reload so every fetch
        // hits the network.
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        self.session = URLSession(configuration: config)
    }

    /// Download an ad asset and produce a full playback timeline.
    /// Returns `nil` on network/decode/padding/first-frame-upload failure.
    /// Per-frame failures past frame 0 truncate the timeline.
    public func loadTimeline(for slot: AdSlot) async -> AdTextureTimeline? {
        guard let url = URL(string: slot.imageUrl) else {
            dlog("⚠️ AdTextureLoader: invalid imageUrl '\(slot.imageUrl)' for adIndex=\(slot.adIndex)")
            return nil
        }

        // Per-request cache bypass too, in case a caller injects a session.
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        let data: Data
        do {
            (data, _) = try await session.data(for: req)
        } catch {
            dlog("❌ AdTextureLoader: download failed for adIndex=\(slot.adIndex): \(error)")
            return nil
        }

        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            dlog("❌ AdTextureLoader: decode failed for adIndex=\(slot.adIndex)")
            return nil
        }

        let frameCount = CGImageSourceGetCount(source)
        guard frameCount > 0 else {
            dlog("❌ AdTextureLoader: zero-frame image for adIndex=\(slot.adIndex)")
            return nil
        }

        let kind = AdAssetKind(
            uti: CGImageSourceGetType(source) as String?,
            frameCount: frameCount
        )
        dlog("🖼️ AdTextureLoader: adIndex=\(slot.adIndex) type=\(kind) bytes=\(data.count)")

        var frames: [AdTextureFrame] = []
        var cumulativePTS: TimeInterval = 0
        frames.reserveCapacity(frameCount)

        for i in 0..<frameCount {
            guard let cgFrame = CGImageSourceCreateImageAtIndex(source, i, nil) else {
                dlog("⚠️ AdTextureLoader: failed to decode frame \(i) for adIndex=\(slot.adIndex), truncating timeline at \(frames.count) frame(s)")
                break
            }
            guard let padded = paddedImage(
                from: cgFrame,
                targetAspectRatio: slot.adUnitRatio,
                customColor: slot.color
            ) else {
                dlog("⚠️ AdTextureLoader: padding failed for frame \(i) adIndex=\(slot.adIndex)")
                break
            }
            guard let tex = await uploadMipmappedTexture(from: padded) else {
                dlog("⚠️ AdTextureLoader: GPU upload failed for frame \(i) adIndex=\(slot.adIndex)")
                break
            }
            frames.append(AdTextureFrame(pts: cumulativePTS, texture: tex))
            // Last frame's delay still counts toward loopDuration.
            cumulativePTS += frameDelay(source: source, frameIndex: i)
        }

        guard !frames.isEmpty else { return nil }

        let loopDuration: TimeInterval = frames.count > 1 ? cumulativePTS : 0
        if frames.count > 1 {
            dlog("🎬 AdTextureLoader: adIndex=\(slot.adIndex) timeline ready frames=\(frames.count) loop=\(String(format: "%.3f", loopDuration))s")
        }
        return AdTextureTimeline(frames: frames, loopDuration: loopDuration)
    }

    /// Upload `image` as the base level and fill mip levels 1..N on the GPU.
    private func uploadMipmappedTexture(from image: CGImage) async -> MTLTexture? {
        do {
            let tex = try await textureLoader.newTexture(
                cgImage: image,
                options: [
                    .SRGB: false,
                    .allocateMipmaps: true,
                    .generateMipmaps: false,
                    .textureUsage: NSNumber(value: MTLTextureUsage.shaderRead.rawValue)
                ]
            )
            await generateMipmapsOnGPU(for: tex)
            return tex
        } catch {
            return nil
        }
    }

    /// Per-frame display delay in seconds. Tries GIF / APNG / WebP
    /// dictionaries (in that order); falls back to 0.1s.
    private func frameDelay(source: CGImageSource, frameIndex: Int) -> TimeInterval {
        let defaultDelay: TimeInterval = 0.1
        guard let props = CGImageSourceCopyPropertiesAtIndex(source, frameIndex, nil)
                as? [CFString: Any] else {
            return defaultDelay
        }

        // Prefer unclamped, fall back to clamped.
        func read(_ dict: CFString, unclamped: CFString, clamped: CFString) -> TimeInterval? {
            guard let sub = props[dict] as? [CFString: Any] else { return nil }
            if let v = sub[unclamped] as? Double, v > 0 { return v }
            if let v = sub[clamped] as? Double, v > 0 { return v }
            return nil
        }

        if let d = read(
            kCGImagePropertyGIFDictionary,
            unclamped: kCGImagePropertyGIFUnclampedDelayTime,
            clamped: kCGImagePropertyGIFDelayTime
        ) { return d }

        if let d = read(
            kCGImagePropertyPNGDictionary,
            unclamped: kCGImagePropertyAPNGUnclampedDelayTime,
            clamped: kCGImagePropertyAPNGDelayTime
        ) { return d }

        if #available(iOS 14.0, *) {
            if let d = read(
                kCGImagePropertyWebPDictionary,
                unclamped: kCGImagePropertyWebPUnclampedDelayTime,
                clamped: kCGImagePropertyWebPDelayTime
            ) { return d }
        }

        return defaultDelay
    }

    /// GPU blit pass that fills mip levels 1..N from level 0.
    private func generateMipmapsOnGPU(for texture: MTLTexture) async {
        guard texture.mipmapLevelCount > 1,
              let queue = mipmapQueue,
              let cmd = queue.makeCommandBuffer(),
              let blit = cmd.makeBlitCommandEncoder() else {
            return
        }
        blit.generateMipmaps(for: texture)
        blit.endEncoding()
        // Wait so the texture is sample-ready on return.
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            cmd.addCompletedHandler { _ in continuation.resume() }
            cmd.commit()
        }
    }

    // MARK: - Padding

    /// Pad `original` to `targetAspectRatio` with bars filled by either
    /// `customColor` (0..255 RGB, 0..1 alpha) or the image's edge pixels.
    private func paddedImage(
        from original: CGImage,
        targetAspectRatio: Double,
        customColor: (r: Double, g: Double, b: Double, a: Double)?
    ) -> CGImage? {
        let imgW = original.width
        let imgH = original.height
        guard imgW > 0, imgH > 0, targetAspectRatio > 0 else { return nil }

        let imgAspect = Double(imgW) / Double(imgH)
        var canvasW = imgW
        var canvasH = imgH
        if imgAspect > targetAspectRatio {
            canvasH = Int((Double(imgW) / targetAspectRatio).rounded())
        } else if imgAspect < targetAspectRatio {
            canvasW = Int((Double(imgH) * targetAspectRatio).rounded())
        }

        let offsetX = (canvasW - imgW) / 2
        let offsetY = (canvasH - imgH) / 2

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo: UInt32 = CGImageAlphaInfo.premultipliedLast.rawValue
        guard let ctx = CGContext(
            data: nil,
            width: canvasW,
            height: canvasH,
            bitsPerComponent: 8,
            bytesPerRow: canvasW * 4,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else { return nil }

        // Fill padding first. CGContext uses bottom-left origin.
        if let color = customColor {
            fillWithCustomColor(
                ctx: ctx,
                color: color,
                offsetX: offsetX,
                offsetY: offsetY,
                imgW: imgW,
                imgH: imgH,
                canvasW: canvasW,
                canvasH: canvasH
            )
        } else {
            fillWithEdgeColors(
                ctx: ctx,
                image: original,
                offsetX: offsetX,
                offsetY: offsetY,
                imgW: imgW,
                imgH: imgH,
                canvasW: canvasW,
                canvasH: canvasH
            )
        }

        // Composite source image at center (image top-left → CG bottom-left).
        let drawRect = CGRect(
            x: offsetX,
            y: canvasH - offsetY - imgH,
            width: imgW,
            height: imgH
        )
        ctx.draw(original, in: drawRect)

        return ctx.makeImage()
    }

    /// Fill all four padding bars with a manifest-supplied color.
    private func fillWithCustomColor(
        ctx: CGContext,
        color: (r: Double, g: Double, b: Double, a: Double),
        offsetX: Int,
        offsetY: Int,
        imgW: Int,
        imgH: Int,
        canvasW: Int,
        canvasH: Int
    ) {
        ctx.setFillColor(
            red: CGFloat(color.r) / 255.0,
            green: CGFloat(color.g) / 255.0,
            blue: CGFloat(color.b) / 255.0,
            alpha: CGFloat(color.a)
        )

        // Top band.
        if offsetY > 0 {
            ctx.fill(CGRect(x: 0, y: canvasH - offsetY, width: canvasW, height: offsetY))
        }
        // Bottom band.
        let bottomBandH = canvasH - imgH - offsetY
        if bottomBandH > 0 {
            ctx.fill(CGRect(x: 0, y: 0, width: canvasW, height: bottomBandH))
        }
        // Left/right bands at the image's vertical extent.
        let bandsYCG = canvasH - imgH - offsetY
        if offsetX > 0 {
            ctx.fill(CGRect(x: 0, y: bandsYCG, width: offsetX, height: imgH))
        }
        let rightBandW = canvasW - (offsetX + imgW)
        if rightBandW > 0 {
            ctx.fill(CGRect(x: offsetX + imgW, y: bandsYCG, width: rightBandW, height: imgH))
        }
    }

    /// Fill padding bars with the average color of the matching image edge:
    /// 1-px top/bottom rows for horizontal bars; `min(10, w/10)`-px columns
    /// for vertical bars.
    private func fillWithEdgeColors(
        ctx: CGContext,
        image: CGImage,
        offsetX: Int,
        offsetY: Int,
        imgW: Int,
        imgH: Int,
        canvasW: Int,
        canvasH: Int
    ) {
        // Render the source into an RGBA8 buffer we can sample.
        let bytesPerRow = imgW * 4
        var pixels = [UInt8](repeating: 0, count: imgH * bytesPerRow)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo: UInt32 = CGImageAlphaInfo.premultipliedLast.rawValue
        let pointer = pixels.withUnsafeMutableBufferPointer { $0.baseAddress }
        guard let sampleCtx = CGContext(
            data: pointer,
            width: imgW,
            height: imgH,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else { return }
        sampleCtx.draw(image, in: CGRect(x: 0, y: 0, width: imgW, height: imgH))

        // Image top-left → CG row = imgH - 1 - y.
        func avg(x: Int, y: Int, w: Int, h: Int) -> (r: UInt8, g: UInt8, b: UInt8) {
            var r: UInt64 = 0, g: UInt64 = 0, b: UInt64 = 0, count: UInt64 = 0
            for yy in y..<(y + h) {
                let cgRow = imgH - 1 - yy
                guard cgRow >= 0, cgRow < imgH else { continue }
                for xx in x..<(x + w) {
                    guard xx >= 0, xx < imgW else { continue }
                    let idx = cgRow * bytesPerRow + xx * 4
                    r += UInt64(pixels[idx])
                    g += UInt64(pixels[idx + 1])
                    b += UInt64(pixels[idx + 2])
                    count += 1
                }
            }
            if count == 0 { return (0, 0, 0) }
            return (UInt8(r / count), UInt8(g / count), UInt8(b / count))
        }

        func mix(_ a: (UInt8, UInt8, UInt8), _ b: (UInt8, UInt8, UInt8)) -> (UInt8, UInt8, UInt8) {
            (UInt8((UInt16(a.0) + UInt16(b.0)) / 2),
             UInt8((UInt16(a.1) + UInt16(b.1)) / 2),
             UInt8((UInt16(a.2) + UInt16(b.2)) / 2))
        }

        // Top/bottom 1-px rows -> top/bottom bars.
        let top = avg(x: 0, y: 0, w: imgW, h: 1)
        let bottom = avg(x: 0, y: imgH - 1, w: imgW, h: 1)
        let horizontal = mix(top, bottom)

        // Left/right `min(10, w/10)`-px columns -> left/right bars.
        let sampleWidth = max(1, min(10, imgW / 10))
        let left = avg(x: 0, y: 0, w: sampleWidth, h: imgH)
        let right = avg(x: max(0, imgW - sampleWidth), y: 0, w: sampleWidth, h: imgH)
        let vertical = mix(left, right)

        // Horizontal bars.
        ctx.setFillColor(
            red: CGFloat(horizontal.0) / 255.0,
            green: CGFloat(horizontal.1) / 255.0,
            blue: CGFloat(horizontal.2) / 255.0,
            alpha: 1
        )
        if offsetY > 0 {
            ctx.fill(CGRect(x: 0, y: canvasH - offsetY, width: canvasW, height: offsetY))
        }
        let bottomBandH = canvasH - imgH - offsetY
        if bottomBandH > 0 {
            ctx.fill(CGRect(x: 0, y: 0, width: canvasW, height: bottomBandH))
        }

        // Vertical bars.
        ctx.setFillColor(
            red: CGFloat(vertical.0) / 255.0,
            green: CGFloat(vertical.1) / 255.0,
            blue: CGFloat(vertical.2) / 255.0,
            alpha: 1
        )
        let bandsYCG = canvasH - imgH - offsetY
        if offsetX > 0 {
            ctx.fill(CGRect(x: 0, y: bandsYCG, width: offsetX, height: imgH))
        }
        let rightBandW = canvasW - (offsetX + imgW)
        if rightBandW > 0 {
            ctx.fill(CGRect(x: offsetX + imgW, y: bandsYCG, width: rightBandW, height: imgH))
        }
    }
}
