//
//  PlayerViewModel.swift
//  SimplePlayer.Native
//

import Foundation
import AVFoundation
import CoreMedia
import CoreVideo
import SwiftUI
import UIKit
import IOSSDKNative

// MARK: - Player View Model

@Observable
class PlayerViewModel {
    var player = AVPlayer()
    var isPlaying = false
    var currentTime: Double = 0
    var duration: Double = 0
    var hasVideo = false
    var playbackRate: Float = 1.0
    var frameIndex: Int = 0
    var framePTS: Double = 0
    var fps: Double = 0
    /// Container FPS from `AVAssetTrack.nominalFrameRate`.
    var nominalFPS: Float = 0 {
        didSet { session.nominalFPS = nominalFPS }
    }

    /// Engine-agnostic ad/manifest lifecycle. See `IOSSDKCore.AdSession`.
    let session: any AdSession = AdSessionFactory.make()

    /// Seek so playback resumes `secondsBefore` seconds before the slot's
    /// first frame. No-op until `session.isAdsReady`.
    ///
    /// Uses a bounded tolerance instead of frame-accurate seek: ad overlays
    /// render off the live PTS-derived `manifestFrameIndex`, so landing
    /// within a few hundred ms of the slot start is visually identical and
    /// avoids decoding the full GOP from the preceding key-frame.
    func jumpToAdSlot(_ slot: AdSlot, secondsBefore: Double = 0) {
        guard session.isAdsReady else {
            dlog("⏸️ jumpToAdSlot ignored: ads not ready yet (adIndex=\(slot.adIndex))")
            return
        }
        let adTime = session.videoTime(forManifestFrame: slot.startFrame)
        let target = max(0, min(adTime - secondsBefore, duration))
        dlog("⏭️ jumpToAdSlot adIndex=\(slot.adIndex) startFrame=\(slot.startFrame) fps=\(session.effectiveFPS) adTime=\(String(format: "%.3f", adTime))s target=\(String(format: "%.3f", target))s duration=\(String(format: "%.3f", duration))s")

        // Drop pending seeks so rapid taps on the ad strip don't queue up.
        player.currentItem?.cancelPendingSeeks()

        let cmTarget = CMTime(seconds: target, preferredTimescale: 600)
        // ~half-second window each side so AVPlayer skips the full GOP walk.
        let tolerance = CMTime(seconds: 0.5, preferredTimescale: 600)
        player.seek(to: cmTarget, toleranceBefore: tolerance, toleranceAfter: tolerance)
    }

    /// Called on each new video frame with the pixel buffer and its PTS.
    var onFrameReady: ((CVPixelBuffer, CMTime) -> Void)?

    private let rates: [Float] = [0.5, 1.0, 1.5, 2.0]
    private var timeObserver: Any?
    private var videoOutput: AVPlayerItemVideoOutput?
    private var displayLink: CADisplayLink?
    private var displayLinkTarget: DisplayLinkTarget?
    private var lastFrameTime: CFTimeInterval = 0
    private var frameCountForFPS: Int = 0
    private var fpsAccumulator: CFTimeInterval = 0
    private var didLogFirst = false
    private var logCount: Int = 0

    init() {
        // Default service config from bundled `ServiceConfig.json`. Hosts
        // can override via `viewModel.session.serviceConfig = ...`.
        session.serviceConfig = AdServiceConfig.loadFromBundle()
    }

    func loadVideo(url: URL) {
        // Ensure audio plays even when the silent switch is on.
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            dlog("Failed to configure audio session: \(error)")
        }

        let item = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: item)
        hasVideo = true

        Task { @MainActor in
            await self.session.loadManifest()
        }

        // Set up video output for frame buffer access
        setupVideoOutput(for: item)

        // Observe duration + container fps once the asset is ready. Source
        // video size is captured from the first decoded `CVPixelBuffer` via
        // `session.observe`.
        Task { @MainActor in
            if let duration = try? await item.asset.load(.duration) {
                self.duration = CMTimeGetSeconds(duration)
            }
            if let tracks = try? await item.asset.loadTracks(withMediaType: .video),
               let track = tracks.first {
                if let rate = try? await track.load(.nominalFrameRate) {
                    self.nominalFPS = rate
                }
            }
        }

        // Periodic time observer
        removeTimeObserver()
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            guard let self else { return }
            self.currentTime = CMTimeGetSeconds(time)
        }

        // Observe when playback ends
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            self?.isPlaying = false
        }
    }

    func togglePlayPause() {
        guard session.isAdsReady else {
            dlog("⏸️ togglePlayPause ignored: ads not ready yet")
            return
        }
        if isPlaying {
            player.pause()
        } else {
            // If at end, restart
            if currentTime >= duration - 0.5 {
                player.seek(to: .zero)
            }
            player.play()
            player.rate = playbackRate
        }
        isPlaying.toggle()
    }

    func seek(to time: Double) {
        // Cancel in-flight seeks so back-to-back scrubs don't pile up.
        player.currentItem?.cancelPendingSeeks()
        let cmTime = CMTime(seconds: time, preferredTimescale: 600)
        player.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero)
    }

    func stop() {
        player.pause()
        player.seek(to: .zero)
        isPlaying = false
        currentTime = 0
    }

    func reset() {
        player.pause()
        stopDisplayLink()
        if let output = videoOutput, let item = player.currentItem {
            item.remove(output)
        }
        videoOutput = nil
        player.replaceCurrentItem(with: nil)
        isPlaying = false
        currentTime = 0
        duration = 0
        hasVideo = false
        playbackRate = 1.0
        frameIndex = 0
        framePTS = 0
        // Resets manifest + frame indices + videoSize + tracker + gate.
        // Listeners on `session.onManifestChanged` (e.g. `MetalVideoView`)
        // are notified.
        session.reset()
        // Legacy cleanup — older versions wrote ad images to URLCache.
        URLCache.shared.removeAllCachedResponses()
        fps = 0
        lastFrameTime = 0
        frameCountForFPS = 0
        fpsAccumulator = 0
        removeTimeObserver()
    }

    func cyclePlaybackRate() {
        guard let idx = rates.firstIndex(of: playbackRate) else {
            playbackRate = 1.0
            player.rate = 1.0
            return
        }
        let next = rates[(idx + 1) % rates.count]
        playbackRate = next
        if isPlaying {
            player.rate = next
        }
    }

    private func removeTimeObserver() {
        if let observer = timeObserver {
            player.removeTimeObserver(observer)
            timeObserver = nil
        }
    }

    // MARK: - Frame Buffer Output

    private func setupVideoOutput(for item: AVPlayerItem) {
        // Remove previous output if any
        if let old = videoOutput {
            item.remove(old)
        }

        let attributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        let output = AVPlayerItemVideoOutput(pixelBufferAttributes: attributes)
        item.add(output)
        videoOutput = output

        startDisplayLink()
    }

    private func startDisplayLink() {
        stopDisplayLink()
        let target = DisplayLinkTarget { [weak self] in
            self?.handleDisplayLink()
        }
        displayLinkTarget = target
        let link = CADisplayLink(target: target, selector: #selector(DisplayLinkTarget.tick))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    private func stopDisplayLink() {
        displayLink?.invalidate()
        displayLink = nil
        displayLinkTarget = nil
    }

    private func handleDisplayLink() {
        guard let output = videoOutput else { return }
        let hostTime = CACurrentMediaTime()
        let itemTime = output.itemTime(forHostTime: hostTime)
        guard output.hasNewPixelBuffer(forItemTime: itemTime) else { return }

        // Use displayTime to get the frame's real PTS
        var displayTime = CMTime.invalid
        guard let pixelBuffer = output.copyPixelBuffer(
            forItemTime: itemTime,
            itemTimeForDisplay: &displayTime
        ) else { return }

        let realPTS = displayTime.isValid ? displayTime : itemTime
        framePTS = CMTimeGetSeconds(realPTS)

        // Session updates ptsFrameIndex / manifestFrameIndex / videoSize
        // synchronously, so reads via `viewModel.session` see fresh values.
        session.observe(
            pixelBuffer: pixelBuffer,
            pts: realPTS,
            playbackRate: Double(playbackRate)
        )

        if nominalFPS > 0, logCount < 100 {
            let mulReal = Int(CMTimeGetSeconds(realPTS) * Double(nominalFPS))
            dlog("📊 Frame \(logCount): " +
                  "displayTime=\(realPTS.value)/\(realPTS.timescale) " +
                  "displayPTS=\(framePTS)s " +
                  "mulReal=\(mulReal) " +
                  "manifest=\(session.manifestFrameIndex) " +
                  "offset=\(session.frameOffset)")
            logCount += 1
        }

        // Calculate FPS (update once per second)
        let elapsed = hostTime - lastFrameTime
        if lastFrameTime == 0 {
            lastFrameTime = hostTime
        }
        frameCountForFPS += 1
        fpsAccumulator += elapsed
        lastFrameTime = hostTime
        if fpsAccumulator >= 1.0 {
            fps = Double(frameCountForFPS) / fpsAccumulator
            frameCountForFPS = 0
            fpsAccumulator = 0
        }

        onFrameReady?(pixelBuffer, realPTS)
        frameIndex += 1
    }

    deinit {
        stopDisplayLink()
        removeTimeObserver()
    }
}

/// Helper class to avoid CADisplayLink retain cycle (CADisplayLink retains its target).
private class DisplayLinkTarget: NSObject {
    let callback: () -> Void
    init(callback: @escaping () -> Void) {
        self.callback = callback
    }
    @objc func tick() {
        callback()
    }
}
