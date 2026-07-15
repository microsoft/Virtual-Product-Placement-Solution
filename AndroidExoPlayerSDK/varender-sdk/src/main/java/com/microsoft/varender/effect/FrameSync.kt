// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

package com.microsoft.varender.effect

/**
 * Shared frame-index computation used by the Virtual Ads overlay.
 * Converts presentation timestamps to frame indices.
 */
object FrameSync {

    /**
     * Compute frame index from presentation time in microseconds.
     */
    fun frameIndexFromPtsUs(presentationTimeUs: Long, fps: Float): Long {
        return Math.round(presentationTimeUs * fps.toDouble() / 1_000_000.0)
    }

    /**
     * Compute frame index from time in seconds.
     */
    fun frameIndexFromSeconds(timeSeconds: Float, fps: Float): Long {
        return Math.round(timeSeconds.toDouble() * fps.toDouble())
    }
}