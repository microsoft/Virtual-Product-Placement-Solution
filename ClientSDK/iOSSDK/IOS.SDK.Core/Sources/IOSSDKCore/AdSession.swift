//
//  AdSession.swift
//  IOSSDKCore
//
//  Engine-agnostic ad/manifest lifecycle. Public protocols + factory;
//  the concrete `AdSessionImpl` is `@Observable` and SDK-internal.
//
//  Wiring:
//      let session: any AdSession = AdSessionFactory.make()
//      session.serviceConfig = ...
//      session.onManifestChanged = { renderer.loadAdTextures(for: $0) }
//      renderer.onAdTexturesReady = { [weak session] in session?.markAdsReady() }
//      // per decoded frame, any thread:
//      session.observe(pixelBuffer:, pts:, playbackRate:)
//

import Foundation
import Observation
import CoreMedia
import CoreVideo

// MARK: - Public protocols

/// Per-frame data the renderer reads.
public protocol AdRenderFrame: AnyObject {
    /// Overlays for the frame currently being rendered.
    var currentFrameOverlays: [OverlayElement] { get }

    /// Source video pixel dimensions. Zero until the first `observe(...)`.
    var videoSize: CGSize { get }
}

/// Per-decoded-frame ingestion hook. Thread-safe.
public protocol AdFrameObserver: AnyObject {
    /// Update frame indices and dispatch the impression-tracker tick.
    /// Frame-index writes are synchronous so the caller's render closure
    /// sees fresh `currentFrameOverlays` on the same thread.
    func observe(pixelBuffer: CVPixelBuffer, pts: CMTime, playbackRate: Double)
}

/// Engine-agnostic ad-session API.
public protocol AdSession: AdRenderFrame, AdFrameObserver, AnyObject {

    // MARK: Configuration

    /// Service-side ad config. When nil, falls back to `extraFallbackResources`.
    var serviceConfig: AdServiceConfig? { get set }

    /// Bundled JSON resource to load instead of hitting the network.
    var localManifestResource: String? { get set }

    /// Honour the manifest's `frameZeroPts` when computing `manifestFrameIndex`.
    var enableStartPtsIgnoreEditList: Bool { get set }

    /// Container FPS. Host writes when discovered; 0 disables frame-index math.
    var nominalFPS: Float { get set }

    /// Bundled JSON fallbacks tried after a failed service load.
    var extraFallbackResources: [String] { get set }

    // MARK: Outputs

    var manifest: AdManifestParser? { get }

    /// Playback gate. False while ad textures upload.
    var isAdsReady: Bool { get }

    var frameZeroPts: Double { get }
    var ptsFrameIndex: Int64 { get }
    var manifestFrameIndex: Int64 { get }

    /// `enableStartPtsIgnoreEditList ? frameZeroPts : 0`.
    var effectiveFrameZeroPts: Double { get }

    /// `nominalFPS` if set, else the manifest's declared FPS.
    var effectiveFPS: Float { get }

    /// Frame index of `effectiveFrameZeroPts` at `effectiveFPS`.
    var frameOffset: Int64 { get }

    var allAdSlots: [AdSlot] { get }

    /// Manifest frame index → player PTS (seconds).
    func videoTime(forManifestFrame frame: Int) -> Double

    // MARK: Callbacks

    /// Fires when the manifest loads (`parser != nil`) or clears.
    var onManifestChanged: ((AdManifestParser?) -> Void)? { get set }

    /// Fires on `isAdsReady` transitions.
    var onReadinessChanged: ((Bool) -> Void)? { get set }

    // MARK: Lifecycle

    /// Fetch the manifest (service or bundled) and apply it.
    @MainActor func loadManifest() async

    /// Open the playback gate. Called by the renderer once textures finish.
    @MainActor func markAdsReady()

    /// Full teardown on video swap.
    @MainActor func reset()
}

// MARK: - Factory

public enum AdSessionFactory {
    /// Returns a fresh, unconfigured ad session.
    public static func make() -> any AdSession {
        AdSessionImpl()
    }
}

// MARK: - Internal implementation

@Observable
internal final class AdSessionImpl: AdSession {

    // MARK: Configuration

    var serviceConfig: AdServiceConfig?
    var localManifestResource: String?
    var enableStartPtsIgnoreEditList: Bool = false
    var nominalFPS: Float = 0
    var extraFallbackResources: [String] = []

    // MARK: Outputs (read-only)

    private(set) var manifest: AdManifestParser?
    private(set) var isAdsReady: Bool = true
    private(set) var frameZeroPts: Double = 0
    private(set) var ptsFrameIndex: Int64 = 0
    private(set) var manifestFrameIndex: Int64 = 0
    private(set) var videoSize: CGSize = .zero

    var effectiveFrameZeroPts: Double {
        enableStartPtsIgnoreEditList ? frameZeroPts : 0
    }

    var effectiveFPS: Float {
        if nominalFPS > 0 { return nominalFPS }
        if let mf = manifest?.metadata.fps, mf > 0 { return Float(mf) }
        return 0
    }

    var frameOffset: Int64 {
        let fps = effectiveFPS
        guard fps > 0 else { return 0 }
        return Int64((effectiveFrameZeroPts * Double(fps)).rounded())
    }

    var allAdSlots: [AdSlot] { manifest?.allAdSlots ?? [] }

    var currentFrameOverlays: [OverlayElement] {
        guard let parser = manifest else { return [] }
        return parser.elements(atFrame: Int(manifestFrameIndex))
    }

    func videoTime(forManifestFrame frame: Int) -> Double {
        let fps = effectiveFPS
        guard fps > 0 else { return effectiveFrameZeroPts }
        return Double(frame) / Double(fps) + effectiveFrameZeroPts
    }

    // MARK: Callbacks

    var onManifestChanged: ((AdManifestParser?) -> Void)?
    var onReadinessChanged: ((Bool) -> Void)?

    // MARK: Private state

    @ObservationIgnored private var impressionTracker: AdImpressionTracker?
    @ObservationIgnored private var lastTrackerFrameIndex: Int64 = .min

    // MARK: Init

    init() {}

    // MARK: - Lifecycle

    @MainActor
    func loadManifest() async {
        // Tear down any previous manifest / impression tracker.
        impressionTracker?.flush()
        impressionTracker = nil
        lastTrackerFrameIndex = .min
        if manifest != nil {
            manifest = nil
            frameZeroPts = 0
            onManifestChanged?(nil)
        }

        // Close the gate only when actually fetching from the service.
        let shouldGate = (serviceConfig != nil && localManifestResource == nil)
        if shouldGate, isAdsReady {
            isAdsReady = false
            onReadinessChanged?(false)
        }

        // Local-mock override: skip the network entirely.
        if let resource = localManifestResource {
            dlog("🔌 Local mock manifest requested: \(resource).json (skipping remote ad service)")
            loadBundledFallback(resourceNames: [resource])
            return
        }

        guard let config = serviceConfig else {
            dlog("⚠️ No serviceConfig set; trying bundled fallback.")
            loadBundledFallback(resourceNames: extraFallbackResources)
            return
        }

        dlog("⏳ Fetching ad manifest from service for pubVideoId=\(config.pubVideoId) …")
        let service = AllProcessService(config: config)
        do {
            let m = try await service.getAllProcessedData(
                pubVideoId: config.pubVideoId,
                clientType: config.clientType,
                userLabel: config.userLabel
            )
            let parser = AdManifestParser(manifest: m)
            applyParsedManifest(
                parser,
                source: "AllProcessService(pubVideoId=\(config.pubVideoId))"
            )
        } catch {
            dlog("❌ AllProcessService.getAllProcessedData failed: \(error)")
            dlog("↪️ Falling back to bundled snapshot for pubVideoId=\(config.pubVideoId)")
            var candidates: [String] = [config.pubVideoId]
            candidates.append(contentsOf: extraFallbackResources)
            loadBundledFallback(resourceNames: candidates)
        }
    }

    /// Open the playback gate. Called by the renderer's
    /// `onAdTexturesReady` after every per-slot texture finishes uploading.
    @MainActor
    func markAdsReady() {
        guard !isAdsReady else { return }
        dlog("🟢 AdSession: ads ready, playback gate open")
        isAdsReady = true
        onReadinessChanged?(true)
    }

    /// Full teardown on video swap.
    @MainActor
    func reset() {
        impressionTracker?.flush()
        impressionTracker = nil
        lastTrackerFrameIndex = .min
        ptsFrameIndex = 0
        manifestFrameIndex = 0
        videoSize = .zero
        frameZeroPts = 0
        if manifest != nil {
            manifest = nil
            onManifestChanged?(nil)
        }
        if !isAdsReady {
            isAdsReady = true
            onReadinessChanged?(true)
        }
    }

    // MARK: - Per-frame ingestion (any thread)

    func observe(pixelBuffer: CVPixelBuffer, pts: CMTime, playbackRate: Double) {
        // First-frame videoSize capture.
        if videoSize.width <= 0 || videoSize.height <= 0 {
            let w = CVPixelBufferGetWidth(pixelBuffer)
            let h = CVPixelBufferGetHeight(pixelBuffer)
            videoSize = CGSize(width: w, height: h)
        }

        let ptsSeconds = CMTimeGetSeconds(pts)
        let fps = nominalFPS
        if fps > 0, ptsSeconds.isFinite {
            ptsFrameIndex = Int64((ptsSeconds * Double(fps)).rounded())
            let adjusted = ptsSeconds - effectiveFrameZeroPts
            manifestFrameIndex = Int64((adjusted * Double(fps)).rounded())
        }

        // Impression tracker debounce on main.
        let frameIndex = manifestFrameIndex
        if impressionTracker != nil {
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                guard let tracker = self.impressionTracker else { return }
                if frameIndex != self.lastTrackerFrameIndex {
                    self.lastTrackerFrameIndex = frameIndex
                    tracker.update(frameIndex: Int(frameIndex),
                                   playbackRate: playbackRate)
                }
            }
        }
    }

    // MARK: - Private

    @MainActor
    private func loadBundledFallback(resourceNames: [String]) {
        for name in resourceNames {
            if let url = Bundle.main.url(forResource: name, withExtension: "json") {
                do {
                    let parser = try AdManifestParser(contentsOf: url)
                    applyParsedManifest(parser, source: "bundled \(name).json")
                    return
                } catch {
                    dlog("❌ Failed to decode bundled \(name).json: \(error)")
                }
            }
        }
        dlog("⚠️ No bundled fallback manifest found. Overlays will be empty.")
        // Nothing to wait for — release the playback gate.
        markAdsReady()
    }

    @MainActor
    private func applyParsedManifest(_ parser: AdManifestParser, source: String) {
        manifest = parser
        frameZeroPts = parser.metadata.frameZeroPts
        let m = parser.manifest
        dlog("✅ Ad manifest loaded [\(source)]")
        dlog("   videoId=\(m.videoId) publisherVideoId=\(m.publisherVideoId) deliveryId=\(m.deliveryId ?? 0)")
        dlog("   meta: \(m.videoMeta.width)x\(m.videoMeta.height) fps=\(m.videoMeta.fps) nFrames=\(m.videoMeta.nFrames) startPTS=\(m.videoMeta.startPTS) ptsOffset=\(m.videoMeta.ptsOffset)")
        dlog("   frameZeroPts=\(parser.metadata.frameZeroPts) frameOffset=\(frameOffset) ads=\(parser.allAdSlots.count)")
        for slot in parser.allAdSlots {
            dlog("   - ad #\(slot.adIndex) startFrame=\(slot.startFrame)")
        }
        onManifestChanged?(parser)

        // If zero ad slots, there are no textures to wait on — open the gate.
        if parser.allAdSlots.isEmpty {
            markAdsReady()
        }

        // Bootstrap the impression tracker when service config is present.
        if let config = serviceConfig {
            let impressionService = UploadImpressionService(
                config: config,
                deliveryId: parser.manifest.deliveryId ?? 0
            )
            impressionTracker = AdImpressionTracker(service: impressionService, parser: parser)
            lastTrackerFrameIndex = .min
            dlog("📡 Impression tracker armed: deliveryId=\(parser.manifest.deliveryId ?? 0) version=\(config.version)")
        }
    }
}
