//
//  PlayerViewModel.swift
//  SimplePlayer.TT
//

import Foundation
import AVFoundation
import CoreMedia
import CoreVideo
import SwiftUI
import IOSSDKSampleBuffer

@Observable
class PlayerViewModel {
    let engine: TTVideoEngine
    /// Renderer for the per-frame fragment shader pass. Nil on devices
    /// where Metal init fails.
    let renderer: (any Renderer)?

    /// Engine-agnostic ad/manifest lifecycle. See `IOSSDKCore.AdSession`.
    let session: any AdSession = AdSessionFactory.make()

    var isPlaying = false
    var currentTime: Double = 0
    var duration: Double = 0
    var hasVideo = false
    var playbackRate: Float = 1.0

    // Frame stats surfaced in the overlay (engine-side telemetry).
    var framePTS: Double = 0
    var frameTimestamp: Int64 = 0   // raw timestamp from SDK (milliseconds)
    var fps: Double = 0
    /// Container FPS. TT discovers this lazily from frame timestamps.
    var nominalFPS: Float = 0 {
        didSet { session.nominalFPS = nominalFPS }
    }

    /// Called on each new video frame with the pixel buffer and its PTS.
    var onFrameReady: ((CVPixelBuffer, CMTime) -> Void)?

    /// Seek so playback resumes `secondsBefore` seconds before the slot's
    /// first frame. No-op until `session.isAdsReady`.
    func jumpToAdSlot(_ slot: AdSlot, secondsBefore: Double = 0) {
        guard session.isAdsReady else {
            dlog("⏸️ jumpToAdSlot ignored: ads not ready yet (adIndex=\(slot.adIndex))")
            return
        }
        let adTime = session.videoTime(forManifestFrame: slot.startFrame)
        // TTVideoEngine's accurate seek lands on the last frame whose PTS ≤
        // target. `adTime = frame / fps` doesn't equal the muxer-quantized
        // PTS exactly, so the engine can resolve to frame N-1. Nudge by
        // half a frame so we land inside frame N's display window.
        let fps = Double(session.effectiveFPS)
        let halfFrame = fps > 0 ? 0.5 / fps : 0
        let target = max(0, min(adTime - secondsBefore + halfFrame, duration))
        dlog("⏭️ jumpToAdSlot adIndex=\(slot.adIndex) startFrame=\(slot.startFrame) fps=\(session.effectiveFPS) (nominalFPS=\(nominalFPS)) adTime=\(String(format: "%.3f", adTime))s target=\(String(format: "%.3f", target))s duration=\(String(format: "%.3f", duration))s")
        seek(to: target)
    }

    private let delegateProxy = EngineDelegateProxy()
    private let frameHandler = FrameHandler()
    private var videoWrapper: UnsafeMutablePointer<EngineVideoWrapper>?
    private var pollTimer: Timer?
    private let rates: [Float] = [0.5, 1.0, 1.5, 2.0]

    // FPS measurement
    private var lastFrameHostTime: CFTimeInterval = 0
    private var frameCountForFPS: Int = 0
    private var fpsAccumulator: CFTimeInterval = 0

    // Used to derive nominalFPS from inter-frame timestamp deltas when
    // the SDK option doesn't surface a container fps.
    private var lastFrameTimestampMs: Int64 = -1
    private var derivedFrameIntervals: [Int64] = []

    // Per-frame log counter (first-100-frames trace).
    private var loggedFrameCount: Int = 0
    private let maxLoggedFrames: Int = 100

    init() {
        let engine = TTVideoEngine(ownPlayer: true)
        self.engine = engine
        self.renderer = RendererFactory.make()

        // Default service config from bundled `ServiceConfig.json`. Hosts
        // can override via `viewModel.session.serviceConfig = ...`.
        session.serviceConfig = AdServiceConfig.loadFromBundle()
        // Legacy demo fixture for the offline/no-config path.
        session.extraFallbackResources = ["32"]

        // Forward manifest load/clear to the renderer's texture pipeline.
        session.onManifestChanged = { [weak self] parser in
            guard let self else { return }
            if let parser {
                self.renderer?.loadAdTextures(for: parser)
            } else {
                self.renderer?.clearAdTextures()
            }
        }

        // Renderer signals ad textures ready → open the playback gate.
        self.renderer?.onAdTexturesReady = { [weak self] in
            self?.session.markAdsReady()
        }

        // Frame dumping intentionally disabled. Re-enable by restoring the
        // DEBUG block that called `renderer.enableFrameDump(...)`.

        // Aspect-fit scaling. VEKKeyViewScaleMode = 260 (anonymous enum,
        // not bridged to Swift).
        engine.setOptions([
            NSNumber(value: 260):
                NSNumber(value: TTVideoEngineScalingMode.aspectFit.rawValue)
        ])

        engine.delegate = delegateProxy
        frameHandler.viewModel = self
        attachVideoWrapper()

        delegateProxy.onPlaybackStateChanged = { [weak self] state in
            guard let self else { return }
            self.isPlaying = (state == .playing)
        }
        delegateProxy.onPrepared = { [weak self] in
            guard let self else { return }
            self.hasVideo = true
            let d = self.engine.duration
            if d.isFinite, d > 0 { self.duration = d }
            self.nominalFPS = self.queryNominalFPS()
        }
        delegateProxy.onLoadStateChanged = { _ in }
        delegateProxy.onFinished = { [weak self] _ in
            self?.isPlaying = false
        }
    }

    func loadVideo(url: URL) {
        // Ensure audio plays even when the silent switch is on.
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            dlog("Failed to configure audio session: \(error)")
        }

        engine.stop()
        // `setLocalURL` only accepts file:// paths. Remote URLs go through
        // `TTVideoEngineUrlSource` via `setVideoEngineVideoSource:`.
        if url.isFileURL {
            engine.setLocalURL(url.absoluteString)
        } else {
            let urlString = url.absoluteString
            let source = TTVideoEngineUrlSource(
                url: urlString,
                cacheKey: cacheKey(for: url)
            )
            engine.setVideoEngineVideoSource(source)
        }
        hasVideo = true
        currentTime = 0
        duration = 0
        Task { @MainActor in
            await self.session.loadManifest()
        }
        engine.playbackSpeed = CGFloat(playbackRate)
        // Do not auto-play — user must tap play so the gate runs first.
        startPolling()
    }

    func togglePlayPause() {
        guard session.isAdsReady else {
            dlog("⏸️ togglePlayPause ignored: ads not ready yet")
            return
        }
        if engine.playbackState == .playing {
            engine.pause()
        } else {
            if duration > 0, currentTime >= duration - 0.5 {
                engine.setCurrentPlaybackTime(0, complete: { _ in })
            }
            engine.play()
            engine.playbackSpeed = CGFloat(playbackRate)
        }
    }

    func seek(to time: Double) {
        engine.setCurrentPlaybackTime(time, complete: { _ in })
    }

    func stop() {
        engine.pause()
        engine.setCurrentPlaybackTime(0, complete: { _ in })
        currentTime = 0
        isPlaying = false
    }

    func reset() {
        stopPolling()
        engine.stop()
        currentTime = 0
        duration = 0
        hasVideo = false
        playbackRate = 1.0
        isPlaying = false
        framePTS = 0
        frameTimestamp = 0
        fps = 0
        nominalFPS = 0
        // Resets manifest + frame indices + tracker + gate. The
        // `onManifestChanged(nil)` wired in `init` clears ad textures.
        session.reset()
        // Legacy cleanup — older versions wrote ad images to the global
        // URLCache. New downloads use ephemeral sessions.
        URLCache.shared.removeAllCachedResponses()
        lastFrameHostTime = 0
        frameCountForFPS = 0
        fpsAccumulator = 0
        lastFrameTimestampMs = -1
        derivedFrameIntervals.removeAll()
        loggedFrameCount = 0
    }

    func cyclePlaybackRate() {
        guard let idx = rates.firstIndex(of: playbackRate) else {
            playbackRate = 1.0
            engine.playbackSpeed = 1.0
            return
        }
        let next = rates[(idx + 1) % rates.count]
        playbackRate = next
        engine.playbackSpeed = CGFloat(next)
    }

    private func startPolling() {
        stopPolling()
        let t = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self else { return }
            let cur = self.engine.currentPlaybackTime
            if cur.isFinite, cur >= 0 { self.currentTime = cur }
            if self.duration <= 0 {
                let d = self.engine.duration
                if d.isFinite, d > 0 { self.duration = d }
            }
        }
        RunLoop.main.add(t, forMode: .common)
        pollTimer = t
    }

    private func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    // MARK: - Video Frame Wrapper

    /// Returns the video's nominal (container) FPS via the SDK option.
    /// VEKGetKeyPlayerContainerFPS_CGFloat = (1 << 20) + 7 = 1048583.
    private func queryNominalFPS() -> Float {
        let key = NSNumber(value: (1 << 20) + 7)
        if let v = engine.getOptionBykey(key) as? NSNumber {
            return v.floatValue
        }
        return 0
    }

    /// Stable per-URL cache key for `TTVideoEngineUrlSource`. The SDK doc
    /// recommends an MD5; we use a hash to keep CommonCrypto out of the
    /// import surface. Deterministic per URL, which is all the SDK needs.
    private func cacheKey(for url: URL) -> String {
        let raw = url.absoluteString
        let hash = raw.utf8.reduce(into: UInt64(1469598103934665603)) { acc, byte in
            acc ^= UInt64(byte)
            acc = acc &* 1099511628211
        }
        return String(hash, radix: 16)
    }

    private func attachVideoWrapper() {
        detachVideoWrapper()
        let ctx = Unmanaged.passRetained(frameHandler).toOpaque()
        let ptr = UnsafeMutablePointer<EngineVideoWrapper>.allocate(capacity: 1)
        ptr.pointee = EngineVideoWrapper(
            process: ttvFrameProcess,
            release: ttvFrameRelease,
            context: ctx
        )
        videoWrapper = ptr
        engine.setVideoWrapper(ptr)
    }

    private func detachVideoWrapper() {
        guard let ptr = videoWrapper else { return }
        // Tell the engine to drop the wrapper; this triggers our release callback,
        // which balances the passRetained() above.
        engine.setVideoWrapper(nil)
        ptr.deallocate()
        videoWrapper = nil
    }

    /// Invoked by the C callback on the SDK's decode/output thread.
    fileprivate func handleFrame(pixelBuffer: CVPixelBuffer, timestamp: Int64) {
        // SDK delivers timestamp in milliseconds (verified: 25 fps clip
        // advances by 40 between frames).
        let ptsSeconds = Double(timestamp) / 1_000.0
        let realPTS = CMTime(value: timestamp, timescale: 1_000)

        // First-N-frames trace for ffprobe comparison.
        if loggedFrameCount < maxLoggedFrames {
            let idx = loggedFrameCount
            loggedFrameCount += 1
            dlog(String(format: "📊 Frame %3d: timestamp=%lld / 1000, pts=%.3fs",
                         idx, timestamp, ptsSeconds))
        }

        // ---- Derive nominalFPS from timestamp deltas if the SDK option is 0 ----
        if nominalFPS == 0 {
            if lastFrameTimestampMs >= 0 {
                let delta = timestamp - lastFrameTimestampMs
                if delta > 0 && delta < 1000 {
                    derivedFrameIntervals.append(delta)
                    // Wait for a stable sample so we don't divide by an outlier.
                    if derivedFrameIntervals.count >= 5 {
                        let sorted = derivedFrameIntervals.sorted()
                        let medianMs = Double(sorted[sorted.count / 2])
                        if medianMs > 0 {
                            let derived = Float(1000.0 / medianMs)
                            // Snap to common rates when close (24/25/30/50/60).
                            let candidates: [Float] = [24, 25, 30, 50, 60, 120]
                            let snapped = candidates.first(where: { abs($0 - derived) < 0.5 }) ?? derived
                            self.nominalFPS = snapped
                        }
                    }
                }
            }
            lastFrameTimestampMs = timestamp
        }

        let hostTime = CACurrentMediaTime()
        let elapsed = lastFrameHostTime == 0 ? 0 : (hostTime - lastFrameHostTime)
        lastFrameHostTime = hostTime
        frameCountForFPS += 1
        fpsAccumulator += elapsed
        let measuredFPS: Double
        let resetFPSCounters: Bool
        if fpsAccumulator >= 1.0 {
            measuredFPS = Double(frameCountForFPS) / fpsAccumulator
            resetFPSCounters = true
        } else {
            measuredFPS = self.fps
            resetFPSCounters = false
        }

        // Push current fps to the session for PTS→frame math.
        session.nominalFPS = nominalFPS

        // Session updates ptsFrameIndex / manifestFrameIndex / videoSize
        // synchronously, so the render closure below sees fresh overlays.
        session.observe(
            pixelBuffer: pixelBuffer,
            pts: realPTS,
            playbackRate: Double(self.playbackRate)
        )

        // Hand the raw pixel buffer + PTS to the external consumer.
        onFrameReady?(pixelBuffer, realPTS)

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.framePTS = ptsSeconds
            self.frameTimestamp = timestamp
            self.fps = measuredFPS
            if resetFPSCounters {
                self.frameCountForFPS = 0
                self.fpsAccumulator = 0
            }
            if self.nominalFPS == 0 {
                let n = self.queryNominalFPS()
                if n > 0 { self.nominalFPS = n }
            }
        }
    }

    deinit {
        detachVideoWrapper()
        stopPolling()
    }
}

// MARK: - Frame Handler (bridges C callback to PlayerViewModel)

private class FrameHandler {
    weak var viewModel: PlayerViewModel?

    fileprivate func process(pixelBuffer: CVPixelBuffer, timestamp: Int64) {
        viewModel?.handleFrame(pixelBuffer: pixelBuffer, timestamp: timestamp)
    }
}

private let ttvFrameProcess: @convention(c) (UnsafeMutableRawPointer?, CVPixelBuffer?, Int64) -> Void = { context, frame, timestamp in
    guard let context, let frame else { return }
    let handler = Unmanaged<FrameHandler>.fromOpaque(context).takeUnretainedValue()
    handler.process(pixelBuffer: frame, timestamp: timestamp)
}

private let ttvFrameRelease: @convention(c) (UnsafeMutableRawPointer?) -> Void = { context in
    guard let context else { return }
    Unmanaged<FrameHandler>.fromOpaque(context).release()
}
