//
//  AdImpressionTracker.swift
//  SimplePlayer.Native
//
//  Frame-driven impression dispatcher mirroring
//  `VideoOverlay.handleAdFrameTransition` +
//  `VideoOverlay.sendImpression` in Reference/H5Player.
//
//  Lifecycle:
//    - `update(frameIndex:playbackRate:)` is invoked every time the player's
//      `manifestFrameIndex` advances. The tracker compares the previous and
//      current active ads and:
//        1. On a backward seek (delta < -1), flushes the accumulated counters
//           for ads that remain active (since H5Player records seeks as
//           separate impressions).
//        2. On exit (ad was active last frame, not active this frame), flushes
//           that ad's counters.
//        3. On entry (newly active), initializes the counters to zero.
//        4. Increments `frameCount += 1` and `scaledFrameCount += 1 / speed`
//           for every still-active ad.
//    - `flush()` sends any remaining accumulated counters; call on teardown.
//

import Foundation

@MainActor
public final class AdImpressionTracker {

    private struct Tracking {
        var frameCount: Int
        var scaledFrameCount: Double
    }

    private let service: UploadImpressionService
    private let parser: AdManifestParser

    private var trackingByAd: [String: Tracking] = [:]
    private var activeAdIndices: Set<String> = []
    private var lastFrameIndex: Int? = nil

    public init(service: UploadImpressionService, parser: AdManifestParser) {
        self.service = service
        self.parser = parser
    }

    /// Call this every time `manifestFrameIndex` changes. `playbackRate`
    /// is the *current* player rate (used for the `scaledFrameCount`
    /// accumulator, matching H5Player's `tracking.scaledFrameCount += 1 / speed`).
    public func update(frameIndex: Int, playbackRate: Double) {
        let overlays = parser.elements(atFrame: frameIndex)
        let currentIndices = Set(overlays.map(\.id))

        // 1) Backward seek within an active ad -> flush + reset.
        if let last = lastFrameIndex {
            let delta = frameIndex - last
            if delta < -1 {
                for adIndex in activeAdIndices where currentIndices.contains(adIndex) {
                    if let t = trackingByAd[adIndex], t.frameCount > 0 {
                        sendImpression(
                            adIndex: adIndex,
                            frameCount: t.frameCount,
                            scaledFrameCount: t.scaledFrameCount
                        )
                    }
                    trackingByAd[adIndex] = Tracking(frameCount: 0, scaledFrameCount: 0)
                }
            }
        }

        // 2) Ads that exited the visible set -> flush + drop.
        for adIndex in activeAdIndices where !currentIndices.contains(adIndex) {
            if let t = trackingByAd[adIndex], t.frameCount > 0 {
                sendImpression(
                    adIndex: adIndex,
                    frameCount: t.frameCount,
                    scaledFrameCount: t.scaledFrameCount
                )
            }
            trackingByAd.removeValue(forKey: adIndex)
        }

        // 3) Ads that just entered -> init counters.
        for adIndex in currentIndices where !activeAdIndices.contains(adIndex) {
            trackingByAd[adIndex] = Tracking(frameCount: 0, scaledFrameCount: 0)
        }

        // 4) Increment counters for every currently active ad.
        let speed = playbackRate > 0 ? playbackRate : 1.0
        for adIndex in currentIndices {
            var t = trackingByAd[adIndex] ?? Tracking(frameCount: 0, scaledFrameCount: 0)
            t.frameCount += 1
            t.scaledFrameCount += 1.0 / speed
            trackingByAd[adIndex] = t
        }

        activeAdIndices = currentIndices
        lastFrameIndex = frameIndex
    }

    /// Flush every accumulated counter (typically on player reset / video swap).
    public func flush() {
        for (adIndex, t) in trackingByAd where t.frameCount > 0 {
            sendImpression(
                adIndex: adIndex,
                frameCount: t.frameCount,
                scaledFrameCount: t.scaledFrameCount
            )
        }
        trackingByAd.removeAll()
        activeAdIndices.removeAll()
        lastFrameIndex = nil
    }

    // MARK: - Private

    private func sendImpression(adIndex: String, frameCount: Int, scaledFrameCount: Double) {
        guard let slot = parser.slot(forAdIndex: adIndex) else { return }
        let body = UploadImpressionService.ImpressionBody(
            adId: slot.adId,
            // H5Player passes `adSlot.adSlotId` directly; Asset/32.json has
            // it as null so we coerce to 0 to keep the JSON shape valid.
            adSlotId: slot.adSlotId ?? 0,
            imageId: slot.imageId,
            scaledFrameCount: scaledFrameCount,
            frameCount: frameCount
        )
        let productId = slot.adProductId
        let service = self.service
        Task { @MainActor in
            do {
                _ = try await service.uploadImpression(adProductId: productId, logData: body)
                dlog("📤 Impression sent adIndex=\(adIndex) product=\(productId) frames=\(frameCount) scaled=\(String(format: "%.3f", scaledFrameCount))")
            } catch {
                dlog("❌ Impression upload failed adIndex=\(adIndex): \(error)")
            }
        }
    }
}
