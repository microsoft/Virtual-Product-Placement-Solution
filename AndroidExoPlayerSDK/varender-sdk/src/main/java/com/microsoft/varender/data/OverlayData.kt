// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

package com.microsoft.varender.data

/**
 * 2D point representing a vertex position.
 * Coordinates are in pixel space of the processed video.
 */
data class Point2D(
    val x: Float,
    val y: Float
)

/**
 * An overlay element representing an ad placement for a specific frame.
 * Contains 4 vertices defining a quadrilateral region in the video.
 */
data class OverlayElement(
    val id: String,
    val vertices: List<Point2D> // exactly 4 vertices: top-left, top-right, bottom-right, bottom-left
)

/**
 * Media type of an ad creative. Detected from the actual bytes of [AdSlot.imageUrl]
 * (magic-byte sniff) rather than file extension or Content-Type header.
 */
enum class AdMediaType {
    IMAGE,   // static PNG / JPEG / WebP — single texture
    GIF      // animated GIF — per-frame texture stream synced to video timeline
}

/**
 * Ad slot configuration containing the ad creative and rendering parameters.
 *
 * - [mediaType] defaults to [AdMediaType.IMAGE]; it is updated to [AdMediaType.GIF]
 *   at asset-load time when magic bytes match GIF87a / GIF89a.
 * - [startFrame] is the first video frame index in which this ad appears; used by
 *   the GIF player to anchor its time origin so the GIF restarts when the ad enters.
 */
data class AdSlot(
    val id: Int,
    val adId: Int,
    val adProductId: Long,
    val adSlotId: Long,
    val imageUrl: String,
    val adUnitRatio: Float,
    val color: AdColor?,
    val brightness: Float = 1.0f,
    val enableInnerShadow: Boolean = false,
    var mediaType: AdMediaType = AdMediaType.IMAGE,
    val startFrame: Int = 0
)

/**
 * RGBA color for ad slot background fill.
 */
data class AdColor(
    val r: Int,
    val g: Int,
    val b: Int,
    val a: Float = 1.0f
)

/**
 * Video metadata from the processing pipeline.
 */
data class VideoMetadata(
    val width: Int,
    val height: Int,
    val fps: Float,
    val totalFrames: Int,
    val igPtsTime: Float = 0f
)

/**
 * Complete overlay data for a video, containing per-frame overlay elements,
 * video metadata, and ad slot configurations.
 */
data class OverlayData(
    val elements: Map<Int, List<OverlayElement>>,  // frameIndex -> overlays
    val metadata: VideoMetadata,
    val adSlots: Map<String, AdSlot>               // adSlotId -> AdSlot
)

/**
 * Frame-count impression payload uploaded per ad-slot exposure window.
 * Mirrors the H5 `ImpressionBody` schema.
 */
data class ImpressionBody(
    val adId: Int,
    val adSlotId: Long,
    val imageId: Int,
    val scaledFrameCount: Double,
    val frameCount: Int
)