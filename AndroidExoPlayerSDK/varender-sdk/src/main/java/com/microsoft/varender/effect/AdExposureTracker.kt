// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

package com.microsoft.varender.effect

import android.util.Log

private const val TAG = "AdExposureTracker"

/**
 * Tracks per-ad-slot frame-count exposures across video frames.
 *
 * Mirrors the H5 player's `handleAdFrameTransition` algorithm:
 *   - Backward seeks (frameIndex delta < -1) flush the current pending impression
 *     for any ad that remains on screen, and reset its counter.
 *   - Ads that just exited the screen flush their pending impression and are removed.
 *   - Ads that just entered the screen initialize at { frameCount=0, scaledFrameCount=0 }.
 *   - For each ad still on screen the same frame index increments
 *     `frameCount` by 1 and `scaledFrameCount` by `1.0 / playbackSpeed`.
 *
 * Impressions are emitted via [onExposureEvent] callback as [ExposureEvent].
 */
class AdExposureTracker(
    private val onExposureEvent: ((ExposureEvent) -> Unit)?
) {
    private data class FrameCounts(var frameCount: Int = 0, var scaledFrameCount: Double = 0.0)

    private var currentAdIds = setOf<String>()
    private val adFrameTracking = mutableMapOf<String, FrameCounts>()
    private var lastFrameIndex: Int? = null

    /**
     * Update the set of ad-slot indices currently visible at [frameIndex].
     *
     * @param newAdIds      The ad-slot indices visible at this frame.
     * @param frameIndex    Current video frame index.
     * @param playbackSpeed Current playback speed (e.g. 1.0f, 1.5f, 2.0f).
     *                      `scaledFrameCount` accumulates `1.0 / playbackSpeed` per frame.
     */
    fun updateAdSlots(newAdIds: Set<String>, frameIndex: Int, playbackSpeed: Float = 1f) {
        val previousAdIds = currentAdIds
        val lastIndex = lastFrameIndex

        // Backward-seek detection: flush + reset counters for ads still on screen.
        if (lastIndex != null) {
            val delta = frameIndex - lastIndex
            if (delta < -1) {
                for (adSlotIndex in previousAdIds) {
                    if (newAdIds.contains(adSlotIndex)) {
                        val counts = adFrameTracking[adSlotIndex] ?: continue
                        if (counts.frameCount > 0) {
                            emitExposureEvent(adSlotIndex, counts.frameCount, counts.scaledFrameCount)
                        }
                        adFrameTracking[adSlotIndex] = FrameCounts()
                    }
                }
            }
        }

        // Exits: flush any pending impression and drop the entry.
        for (adSlotIndex in previousAdIds) {
            if (!newAdIds.contains(adSlotIndex)) {
                val counts = adFrameTracking.remove(adSlotIndex) ?: continue
                if (counts.frameCount > 0) {
                    emitExposureEvent(adSlotIndex, counts.frameCount, counts.scaledFrameCount)
                }
            }
        }

        // Enters: initialize tracking entry.
        for (adSlotIndex in newAdIds) {
            if (!previousAdIds.contains(adSlotIndex)) {
                adFrameTracking[adSlotIndex] = FrameCounts()
            }
        }

        // Per-frame accumulation for every currently-visible ad slot.
        val safeSpeed = if (playbackSpeed > 0f) playbackSpeed.toDouble() else 1.0
        for (adSlotIndex in newAdIds) {
            val counts = adFrameTracking.getOrPut(adSlotIndex) { FrameCounts() }
            counts.frameCount += 1
            counts.scaledFrameCount += 1.0 / safeSpeed
        }

        currentAdIds = newAdIds
        lastFrameIndex = frameIndex
    }

    private fun emitExposureEvent(adSlotIndex: String, frameCount: Int, scaledFrameCount: Double) {
        Log.d(TAG, "Ad exposure: slot=$adSlotIndex, frames=$frameCount, scaled=$scaledFrameCount")
        onExposureEvent?.invoke(
            ExposureEvent(
                adSlotIndex = adSlotIndex,
                frameCount = frameCount,
                scaledFrameCount = scaledFrameCount
            )
        )
    }

    /**
     * Flush all currently active exposures by emitting their pending impressions.
     * Should be called when the player/effect is being released to avoid losing
     * the last in-progress exposure window.
     */
    fun flush() {
        if (adFrameTracking.isEmpty()) return
        val snapshot = adFrameTracking.toMap()
        for ((adSlotIndex, counts) in snapshot) {
            if (counts.frameCount > 0) {
                emitExposureEvent(adSlotIndex, counts.frameCount, counts.scaledFrameCount)
            }
        }
        adFrameTracking.clear()
        currentAdIds = emptySet()
        lastFrameIndex = null
    }

    fun reset() {
        currentAdIds = emptySet()
        adFrameTracking.clear()
        lastFrameIndex = null
    }
}
