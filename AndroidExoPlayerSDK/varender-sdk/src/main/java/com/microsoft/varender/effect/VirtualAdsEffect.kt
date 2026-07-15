// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

package com.microsoft.varender.effect

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.opengl.GLES20
import android.opengl.GLUtils
import android.util.Log
import androidx.media3.common.VideoFrameProcessingException
import androidx.media3.common.util.GlProgram
import androidx.media3.common.util.GlUtil
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram
import androidx.media3.effect.GlEffect
import com.microsoft.varender.data.AdColor
import com.microsoft.varender.data.AdMediaType
import com.microsoft.varender.data.AdSlot
import com.microsoft.varender.data.OverlayData
import com.microsoft.varender.data.OverlayElement
import com.microsoft.varender.data.Point2D
import java.io.ByteArrayInputStream
import kotlinx.coroutines.*

private const val TAG = "VirtualAdsEffect"

/**
 * Media3 GlEffect that renders virtual ad overlays on top of video frames.
 *
 * Key features:
 * - Frame-perfect PTS synchronization via Media3 Effect pipeline
 * - Perspective-correct texture mapping (homogeneous coordinates)
 * - SSAA anti-aliasing in fragment shader
 * - Brightness adjustment and inner shadow effects
 * - Ad image aspect ratio adaptation with edge color filling
 */
@UnstableApi
class VirtualAdsEffect @JvmOverloads constructor(
    overlayData: OverlayData? = null,
    private val enableStartPtsIgnoreEditList: Boolean = false,
    private val onExposureEvent: ((ExposureEvent) -> Unit)? = null,
    private val frameOffsetProvider: () -> Int = { 0 },
    private val playbackSpeedProvider: () -> Float = { 1f }
) : GlEffect {

    /**
     * When true, the shader program subtracts the first observed `presentationTimeUs` from
     * every subsequent PTS, so the effective frame index starts at 0 regardless of the
     * stream's absolute PTS baseline.
     *
     * Required for HLS / live sources whose PTS is not zero-based (e.g. streams whose PTS starts
     * in the trillion-microsecond range). MP4 sources whose PTS starts near 0 should leave
     * this off — the default behavior works correctly for those.
     *
     * Safe to flip at any time before the first frame is drawn. After the first PTS has
     * been captured, the anchor is fixed for the lifetime of the shader program.
     *
     * Exposed as `@JvmField` for direct Java access: `effect.autoAnchorFirstPts = true;`
     */
    @JvmField
    @Volatile
    var autoAnchorFirstPts: Boolean = false

    /**
     * Backing field for [getOverlayData] / [setOverlayData].
     *
     * Marked `@Volatile` so that a [setOverlayData] call from any thread becomes visible
     * to the GL render thread on the next frame without explicit synchronization.
     *
     * Transitions are one-way in practice: null → non-null (initial fill). Replacing it
     * with another non-null value is allowed but unusual; the running shader program will
     * pick the new value up on the next [VirtualAdsShaderProgram.drawFrame] call.
     */
    @Volatile
    private var _overlayData: OverlayData? = overlayData

    /**
     * Returns the currently bound overlay data, or null if [setOverlayData] has not been
     * called yet (the effect is still rendering as a passthrough).
     */
    fun getOverlayData(): OverlayData? = _overlayData

    /**
     * Attach overlay data to this effect. Safe to call from any thread. After this call,
     * the next frame rendered by the GL pipeline will start drawing ad overlays.
     *
     * Typical usage: create the effect with `overlayData = null`, attach it to ExoPlayer
     * BEFORE `prepare()`, then call this method once the asynchronous backend load finishes.
     * This avoids blocking playback start on the ad-data round-trip.
     */
    fun setOverlayData(data: OverlayData) {
        this._overlayData = data
    }

    override fun toGlShaderProgram(context: Context, useHdr: Boolean): BaseGlShaderProgram {
        // Pass a provider (not a snapshot) so the shader program picks up late-arriving
        // overlay data set via setOverlayData() after toGlShaderProgram() has run.
        return VirtualAdsShaderProgram(
            overlayDataProvider = { _overlayData },
            enableStartPtsIgnoreEditList = enableStartPtsIgnoreEditList,
            useHdr = useHdr,
            onExposureEvent = onExposureEvent,
            frameOffsetProvider = frameOffsetProvider,
            playbackSpeedProvider = playbackSpeedProvider,
            autoAnchorFirstPtsProvider = { autoAnchorFirstPts }
        )
    }
}

/**
 * Frame-count impression event emitted when an ad-slot exposure window ends
 * (ad exits the screen, a backward seek resets the counter, or the effect is released).
 *
 * Mirrors the H5 player's impression payload shape.
 */
data class ExposureEvent(
    val adSlotIndex: String,
    val frameCount: Int,
    val scaledFrameCount: Double
)

/**
 * The core GL shader program that composites video + ad overlays in a single render pass.
 */
@UnstableApi
internal class VirtualAdsShaderProgram(
    private val overlayDataProvider: () -> OverlayData?,
    private val enableStartPtsIgnoreEditList: Boolean,
    useHdr: Boolean,
    private val onExposureEvent: ((ExposureEvent) -> Unit)?,
    private val frameOffsetProvider: () -> Int = { 0 },
    private val playbackSpeedProvider: () -> Float = { 1f },
    private val autoAnchorFirstPtsProvider: () -> Boolean = { false }
) : BaseGlShaderProgram(useHdr, /* inputCapacity= */ 1) {

    /**
     * Captured PTS of the first frame ever drawn by this shader program, in microseconds.
     *
     * Only set when [autoAnchorFirstPtsProvider] returned true at the moment the first
     * frame arrived. Once set, stays fixed for the lifetime of the shader program — used
     * to subtract from every subsequent PTS so the effective frame index starts at 0.
     *
     * `Long.MIN_VALUE` sentinel means "not anchored yet".
     */
    private var firstObservedPtsUs: Long = Long.MIN_VALUE

    /**
     * Snapshot of the overlay data captured at the top of the current [drawFrame] call.
     *
     * Set by [drawFrame] only AFTER it has verified [overlayDataProvider] returned non-null.
     * All helpers ([drawOverlay], [ensureTexturesLoaded], [computeFrameIndex], metadata
     * getters …) read overlay data through the [overlayData] accessor below, so they MUST
     * only run inside that branch.
     *
     * GL thread only — no synchronization needed.
     */
    private var activeData: OverlayData? = null

    /**
     * Convenience accessor for [activeData]. Non-null-asserted so existing helper code
     * can stay unchanged; [drawFrame] guarantees [activeData] is set before any helper
     * that touches this property runs.
     */
    private val overlayData: OverlayData get() = activeData!!

    private var videoProgram: GlProgram? = null
    private var overlayProgram: GlProgram? = null

    private val adTextures = mutableMapOf<String, Int>()
    /** Active GIF players, keyed by adSlot id. Mutually exclusive with [adTextures] per slot. */
    private val gifPlayers = mutableMapOf<String, GifAdFramePlayer>()
    /** Decoded GifAdFramePlayer instances waiting to be promoted to [gifPlayers] on the GL thread. */
    private val pendingGifPlayers = mutableMapOf<String, GifAdFramePlayer>()
    private var texturesLoaded = false
    private var textureLoadJob: Job? = null

    private val exposureTracker = AdExposureTracker(onExposureEvent)

    private val fps: Float get() = overlayData.metadata.fps
    private val processedWidth: Int get() = overlayData.metadata.width
    private val processedHeight: Int get() = overlayData.metadata.height
    private val timeOffset: Float get() = overlayData.metadata.igPtsTime

    /**
     * Precomputed constant frame-index offset derived from [enableStartPtsIgnoreEditList] /
     * [timeOffset] / [fps]. Computed lazily once per shader-program lifetime to keep the
     * per-frame [drawFrame] path free of [Math.round] / float multiplies.
     */
    private val baselineFrameIndexOffset: Long by lazy {
        val o: Long = if (enableStartPtsIgnoreEditList) Math.round(timeOffset * fps).toLong() else 0L
        -o
    }

    /** Reusable scratch holding the 16-float perspective-corrected vertex array passed to GL. */
    private val positionScratch = FloatArray(16)

    /**
     * Whether the most recent frame had any visible overlays. Used to short-circuit the
     * exposure-tracker update on long stretches of overlay-free frames \u2014 we only need to
     * call into the tracker on transitions in/out of overlay activity.
     */
    private var previousFrameHadOverlays: Boolean = false

    override fun configure(inputWidth: Int, inputHeight: Int): Size {
        return Size(inputWidth, inputHeight)
    }

    // Debug: frame logging throttle
    private var debugFrameCount = 0L
    private var lastDebugLogTimeMs = 0L

    @Throws(VideoFrameProcessingException::class)
    override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
        try {
            ensureProgramsCreated()

            // Late-binding entry point: until VirtualAdsEffect.setOverlayData() has been
            // called, fall back to a pure video passthrough. This lets business code attach
            // an empty effect to ExoPlayer BEFORE prepare() (satisfying Media3's timing
            // requirement) and then load ad data asynchronously without blocking playback.
            val data = overlayDataProvider()
            if (data == null) {
                drawVideo(inputTexId)
                return
            }
            activeData = data

            ensureTexturesLoaded()
            processPendingAssets()

            // === Auto-anchor first PTS (opt-in via VirtualAdsEffect.autoAnchorFirstPts) ===
            // Subtract the first observed PTS so the effective frame index starts at 0
            // regardless of the stream's absolute PTS baseline. Required for HLS / live
            // sources whose PTS is not zero-based (e.g. streams with PTS in the trillion-us range).
            val anchorEnabled = autoAnchorFirstPtsProvider()
            if (anchorEnabled && firstObservedPtsUs == Long.MIN_VALUE) {
                firstObservedPtsUs = presentationTimeUs
                Log.i(TAG, "Auto-anchor first PTS: ${presentationTimeUs}us — all subsequent " +
                    "PTS values will be normalized relative to this baseline.")
            }
            val effectivePtsUs = if (anchorEnabled) presentationTimeUs - firstObservedPtsUs else presentationTimeUs

            val frameIndex = computeFrameIndex(effectivePtsUs)
            val frameIndexInt = frameIndex.toInt()

            // === Debug logging (every 1 second) ===
            debugFrameCount++
            val nowMs = System.currentTimeMillis()
            if (nowMs - lastDebugLogTimeMs >= 1000L) {
                val timeSeconds = effectivePtsUs / 1_000_000.0
                val baseIndex = FrameSync.frameIndexFromPtsUs(effectivePtsUs, fps)
                val offsetFrames = if (enableStartPtsIgnoreEditList) Math.round(timeOffset * fps) else 0L
                val anchorTag = if (anchorEnabled) " [anchored, raw=${presentationTimeUs}us]" else ""
                Log.d(TAG, "SYNC_DEBUG: pts=${effectivePtsUs}us (${String.format("%.3f", timeSeconds)}s)$anchorTag " +
                    "baseFrame=$baseIndex offset=$offsetFrames finalFrame=$frameIndex " +
                    "hasOverlay=${overlayData.elements.containsKey(frameIndexInt)} " +
                    "overlayCount=${overlayData.elements[frameIndexInt]?.size ?: 0} " +
                    "loadedAssets=${adTextures.size + gifPlayers.size}/${overlayData.adSlots.size} " +
                    "(images=${adTextures.size} gifs=${gifPlayers.size}) " +
                    "videoMeta=${processedWidth}x${processedHeight} fps=$fps igPtsTime=$timeOffset")
                lastDebugLogTimeMs = nowMs
            }

            // === Pass 1: Draw video (passthrough) ===
            drawVideo(inputTexId)

            // === Pass 2: Draw ad overlays ===
            val frameOverlays = overlayData.elements[frameIndexInt] ?: emptyList()

            if (frameOverlays.isNotEmpty()) {
                GLES20.glEnable(GLES20.GL_BLEND)
                GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)

                for (overlay in frameOverlays) {
                    drawOverlay(overlay, frameIndexInt)
                }

                GLES20.glDisable(GLES20.GL_BLEND)
            }

            // === Track exposure transitions ===
            // Skip the tracker call entirely when this frame AND the previous frame both
            // had zero overlays \u2014 nothing to enter, nothing to exit, nothing to accumulate.
            // Saves a .map{}.toSet() + playbackSpeedProvider() call on every empty frame.
            if (frameOverlays.isNotEmpty() || previousFrameHadOverlays) {
                exposureTracker.updateAdSlots(
                    frameOverlays.mapTo(HashSet(frameOverlays.size)) { it.id },
                    frameIndexInt,
                    playbackSpeedProvider()
                )
                previousFrameHadOverlays = frameOverlays.isNotEmpty()
            }

        } catch (e: GlUtil.GlException) {
            throw VideoFrameProcessingException(e)
        }
    }

    private fun computeFrameIndex(presentationTimeUs: Long): Long {
        val base = FrameSync.frameIndexFromPtsUs(presentationTimeUs, fps)
        return base + baselineFrameIndexOffset + frameOffsetProvider()
    }

    private fun ensureProgramsCreated() {
        if (videoProgram == null) {
            videoProgram = GlProgram(VIDEO_VERTEX_SHADER, VIDEO_FRAGMENT_SHADER)
        }
        if (overlayProgram == null) {
            overlayProgram = GlProgram(OVERLAY_VERTEX_SHADER, OVERLAY_FRAGMENT_SHADER)
        }
    }

    private fun ensureTexturesLoaded() {
        if (texturesLoaded || textureLoadJob != null) return

        textureLoadJob = CoroutineScope(Dispatchers.IO).launch {
            // Download all ad assets in parallel so playback isn't gated on serial
            // network round-trips. On slow links, serial loading of N assets meant the
            // first ad-slot window often fired before any texture was ready; parallel
            // fan-out turns total wall time from N*RTT into ~max(RTT) + decode.
            val jobs = overlayData.adSlots.map { (id, slot) ->
                async {
                    try {
                        val downloadResult = GifAdFramePlayer.downloadAndDecode(slot.imageUrl)
                        if (downloadResult == null) {
                            Log.w(TAG, "Failed to download ad asset for slot $id: ${slot.imageUrl}")
                            return@async
                        }

                        if (downloadResult.isGif && downloadResult.gifDrawable != null) {
                            // Tag the slot as GIF so the render path picks the dynamic texture branch.
                            slot.mediaType = AdMediaType.GIF
                            val player = GifAdFramePlayer(
                                gifDrawable = downloadResult.gifDrawable,
                                adUnitRatio = slot.adUnitRatio,
                                color = slot.color
                            )
                            synchronized(pendingGifPlayers) {
                                pendingGifPlayers[id] = player
                            }
                            Log.i(TAG, "Loaded GIF for slot $id: frames=${downloadResult.gifDrawable.numberOfFrames} url=${slot.imageUrl}")
                        } else {
                            // Static image path: decode bytes → letter-box → schedule for GL upload.
                            val bitmap = loadAndAdaptBitmap(slot, downloadResult.bytes)
                            if (bitmap != null) {
                                synchronized(pendingBitmaps) {
                                    pendingBitmaps[id] = bitmap
                                }
                                Log.i(TAG, "Loaded image for slot $id: ${bitmap.width}x${bitmap.height} url=${slot.imageUrl}")
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to load ad asset for slot $id: ${slot.imageUrl}", e)
                    }
                }
            }
            jobs.awaitAll()
            texturesLoaded = true
            Log.i(TAG, "All ad assets loaded: ${overlayData.adSlots.size} slot(s)")
        }
    }

    private val pendingBitmaps = mutableMapOf<String, Bitmap>()

    /** Promote off-thread-prepared assets to GL resources (textures, gif players). */
    private fun processPendingAssets() {
        // Static images → glGenTextures + texImage2D
        if (pendingBitmaps.isNotEmpty()) {
            val bitmapsToProcess: Map<String, Bitmap>
            synchronized(pendingBitmaps) {
                bitmapsToProcess = pendingBitmaps.toMap()
                pendingBitmaps.clear()
            }
            for ((id, bitmap) in bitmapsToProcess) {
                val texId = createTextureFromBitmap(bitmap)
                adTextures[id] = texId
                bitmap.recycle()
            }
        }

        // GIF players → move references, then pre-cache frame 0 on the GL thread so the
        // first render doesn't pay the seek + upload + mipmap cost as visible jank.
        if (pendingGifPlayers.isNotEmpty()) {
            val gifsToProcess: Map<String, GifAdFramePlayer>
            synchronized(pendingGifPlayers) {
                gifsToProcess = pendingGifPlayers.toMap()
                pendingGifPlayers.clear()
            }
            gifPlayers.putAll(gifsToProcess)
            for ((id, player) in gifsToProcess) {
                try {
                    player.preCacheFrame(0)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to pre-cache GIF frame 0 for slot $id", e)
                }
            }
        }
    }

    /**
     * Decode pre-downloaded image bytes (PNG / JPEG / WebP — not GIF) and letter-box to slot ratio.
     */
    private fun loadAndAdaptBitmap(slot: AdSlot, bytes: ByteArray): Bitmap? {
        val originalBitmap = BitmapFactory.decodeStream(ByteArrayInputStream(bytes))

        if (originalBitmap == null) return null

        val targetRatio = slot.adUnitRatio
        val imgWidth = originalBitmap.width
        val imgHeight = originalBitmap.height
        val imgRatio = imgWidth.toFloat() / imgHeight.toFloat()

        var canvasWidth = imgWidth
        var canvasHeight = imgHeight

        if (imgRatio > targetRatio) {
            canvasHeight = Math.round(imgWidth / targetRatio)
        } else if (imgRatio < targetRatio) {
            canvasWidth = Math.round(imgHeight * targetRatio)
        }

        val offsetX = (canvasWidth - imgWidth) / 2
        val offsetY = (canvasHeight - imgHeight) / 2

        val resultBitmap = Bitmap.createBitmap(canvasWidth, canvasHeight, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(resultBitmap)

        if (slot.color != null) {
            fillWithCustomColor(canvas, slot.color, offsetX, offsetY, imgWidth, imgHeight, canvasWidth, canvasHeight)
        } else {
            fillWithEdgeColors(canvas, originalBitmap, offsetX, offsetY, imgWidth, imgHeight, canvasWidth, canvasHeight)
        }

        canvas.drawBitmap(originalBitmap, offsetX.toFloat(), offsetY.toFloat(), null)
        originalBitmap.recycle()

        return resultBitmap
    }

    private fun fillWithCustomColor(
        canvas: Canvas, color: AdColor,
        offsetX: Int, offsetY: Int,
        imgWidth: Int, imgHeight: Int,
        canvasWidth: Int, canvasHeight: Int
    ) {
        val paint = Paint().apply {
            this.color = Color.argb(
                (color.a * 255).toInt(),
                color.r, color.g, color.b
            )
        }
        canvas.drawRect(0f, 0f, canvasWidth.toFloat(), offsetY.toFloat(), paint)
        canvas.drawRect(0f, (offsetY + imgHeight).toFloat(), canvasWidth.toFloat(), canvasHeight.toFloat(), paint)
        canvas.drawRect(0f, offsetY.toFloat(), offsetX.toFloat(), (offsetY + imgHeight).toFloat(), paint)
        canvas.drawRect((offsetX + imgWidth).toFloat(), offsetY.toFloat(), canvasWidth.toFloat(), (offsetY + imgHeight).toFloat(), paint)
    }

    private fun fillWithEdgeColors(
        canvas: Canvas, bitmap: Bitmap,
        offsetX: Int, offsetY: Int,
        imgWidth: Int, imgHeight: Int,
        canvasWidth: Int, canvasHeight: Int
    ) {
        val topColor = getEdgeColor(bitmap, 0, 0, imgWidth, 1)
        val bottomColor = getEdgeColor(bitmap, 0, imgHeight - 1, imgWidth, 1)
        val horizontalColor = averageColor(topColor, bottomColor)

        val paintH = Paint().apply { color = horizontalColor }
        canvas.drawRect(0f, 0f, canvasWidth.toFloat(), offsetY.toFloat(), paintH)
        canvas.drawRect(0f, (offsetY + imgHeight).toFloat(), canvasWidth.toFloat(), canvasHeight.toFloat(), paintH)

        val sampleWidth = minOf(10, imgWidth / 10)
        val leftColor = getEdgeColor(bitmap, 0, 0, sampleWidth, imgHeight)
        val rightColor = getEdgeColor(bitmap, imgWidth - sampleWidth, 0, sampleWidth, imgHeight)
        val verticalColor = averageColor(leftColor, rightColor)

        val paintV = Paint().apply { color = verticalColor }
        canvas.drawRect(0f, offsetY.toFloat(), offsetX.toFloat(), (offsetY + imgHeight).toFloat(), paintV)
        canvas.drawRect((offsetX + imgWidth).toFloat(), offsetY.toFloat(), canvasWidth.toFloat(), (offsetY + imgHeight).toFloat(), paintV)
    }

    private fun getEdgeColor(bitmap: Bitmap, x: Int, y: Int, width: Int, height: Int): Int {
        val safeWidth = minOf(width, bitmap.width - x)
        val safeHeight = minOf(height, bitmap.height - y)
        if (safeWidth <= 0 || safeHeight <= 0) return Color.BLACK

        // Batch pixel read: ~10\u201350\u00d7 faster than the per-pixel getPixel() JNI loop, especially
        // for the left/right vertical strip which can be ~imgHeight pixels tall.
        var r = 0L; var g = 0L; var b = 0L; var count = 0L
        val row = IntArray(safeWidth)
        for (py in y until y + safeHeight) {
            bitmap.getPixels(row, 0, safeWidth, x, py, safeWidth, 1)
            for (pixel in row) {
                r += Color.red(pixel)
                g += Color.green(pixel)
                b += Color.blue(pixel)
                count++
            }
        }
        if (count == 0L) return Color.BLACK
        return Color.rgb((r / count).toInt(), (g / count).toInt(), (b / count).toInt())
    }

    private fun averageColor(c1: Int, c2: Int): Int {
        return Color.rgb(
            (Color.red(c1) + Color.red(c2)) / 2,
            (Color.green(c1) + Color.green(c2)) / 2,
            (Color.blue(c1) + Color.blue(c2)) / 2
        )
    }

    private fun createTextureFromBitmap(bitmap: Bitmap): Int {
        val texIds = IntArray(1)
        GLES20.glGenTextures(1, texIds, 0)
        val texId = texIds[0]

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texId)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR_MIPMAP_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)

        // Apply anisotropic filtering to match the GIF path (GifAdFramePlayer.TexturePool).
        // Without this, static ad images on heavily foreshortened billboards (e.g. the far
        // end of a tilted quad) sample blurrier than animated GIF ads on the same surface.
        val aniso = GifAdFramePlayer.getMaxAnisotropy()
        if (aniso > 1f) {
            GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GL_TEXTURE_MAX_ANISOTROPY_EXT, aniso)
        }

        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
        GLES20.glGenerateMipmap(GLES20.GL_TEXTURE_2D)

        return texId
    }

    private fun drawVideo(inputTexId: Int) {
        val program = videoProgram ?: return
        program.use()
        program.setSamplerTexIdUniform("uTexSampler", inputTexId, 0)
        program.setBufferAttribute(
            "aPosition",
            GlUtil.getNormalizedCoordinateBounds(),
            GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
        )
        program.setBufferAttribute(
            "aTexCoord",
            GlUtil.getTextureCoordinateBounds(),
            GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE
        )
        program.bindAttributesAndUniforms()
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GlUtil.checkGlError()
    }

    private fun drawOverlay(overlay: OverlayElement, frameIndex: Int) {
        val program = overlayProgram ?: return
        val adSlot = overlayData.adSlots[overlay.id]

        // Resolve texture id based on media type: static image → adTextures,
        // animated GIF → ask the player for the frame matching `frameIndex`.
        val texId: Int = when (adSlot?.mediaType) {
            AdMediaType.GIF -> {
                val player = gifPlayers[overlay.id] ?: return
                val t = player.getTextureForVideoFrame(frameIndex, adSlot.startFrame, fps)
                if (t == 0) return
                t
            }
            else -> adTextures[overlay.id] ?: return
        }

        // Fill positionScratch in place (no allocations on the hot path).
        computePerspectiveVerticesInto(overlay.vertices, positionScratch)

        program.use()
        program.setSamplerTexIdUniform("uAdTexture", texId, 1)
        program.setFloatUniform("uBrightness", adSlot?.brightness ?: 1.0f)
        program.setIntUniform("uEnableInnerShadow", if (adSlot?.enableInnerShadow == true) 1 else 0)
        program.setIntUniform("uSamplesX", 4)
        program.setIntUniform("uSamplesY", 4)

        program.setBufferAttribute("aPosition", positionScratch, 4)
        program.setBufferAttribute("aTexCoord", OVERLAY_TEX_COORDS, 4)

        program.bindAttributesAndUniforms()
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_FAN, 0, 4)
        GlUtil.checkGlError()
    }

    /**
     * Map quad corner pixel coordinates to perspective-correct, homogenized NDC vertices.
     *
     * Equivalent to the previous `computePerspectiveVertices(List<Point2D>): FloatArray` but
     * writes into [out] (length 16) and reads [overlayVertices] directly — zero allocations.
     * Algorithm and output shape unchanged.
     */
    private fun computePerspectiveVerticesInto(
        overlayVertices: List<Point2D>,
        out: FloatArray
    ) {
        val invW = 1f / processedWidth
        val invH = 1f / processedHeight

        val x0 = overlayVertices[0].x * invW * 2f - 1f
        val y0 = -(overlayVertices[0].y * invH * 2f - 1f)
        val x1 = overlayVertices[1].x * invW * 2f - 1f
        val y1 = -(overlayVertices[1].y * invH * 2f - 1f)
        val x2 = overlayVertices[2].x * invW * 2f - 1f
        val y2 = -(overlayVertices[2].y * invH * 2f - 1f)
        val x3 = overlayVertices[3].x * invW * 2f - 1f
        val y3 = -(overlayVertices[3].y * invH * 2f - 1f)

        val dx1 = x1 - x2
        val dy1 = y1 - y2
        val dx2 = x3 - x2
        val dy2 = y3 - y2
        val sx = x0 - x1 + x2 - x3
        val sy = y0 - y1 + y2 - y3

        val denom = dx1 * dy2 - dx2 * dy1
        val g = if (denom != 0f) (sx * dy2 - dx2 * sy) / denom else 0f
        val h = if (denom != 0f) (dx1 * sy - sx * dy1) / denom else 0f

        val w0 = 1f
        val w1 = 1f + g
        val w2 = 1f + g + h
        val w3 = 1f + h

        out[0] = x0 * w0; out[1] = y0 * w0; out[2] = 0f; out[3] = w0
        out[4] = x1 * w1; out[5] = y1 * w1; out[6] = 0f; out[7] = w1
        out[8] = x2 * w2; out[9] = y2 * w2; out[10] = 0f; out[11] = w2
        out[12] = x3 * w3; out[13] = y3 * w3; out[14] = 0f; out[15] = w3
    }

    @Throws(VideoFrameProcessingException::class)
    override fun release() {
        try {
            // Flush any in-progress ad exposures before tearing down,
            // so the last session is reported instead of being silently lost.
            try {
                exposureTracker.flush()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to flush exposure tracker on release", e)
            }

            textureLoadJob?.cancel()
            videoProgram?.delete()
            overlayProgram?.delete()

            if (adTextures.isNotEmpty()) {
                val texIds = adTextures.values.toIntArray()
                GLES20.glDeleteTextures(texIds.size, texIds, 0)
                adTextures.clear()
            }

            // Release GIF players (deletes their cached GL textures + recycles GifDrawable).
            for (player in gifPlayers.values) {
                try { player.release() } catch (e: Exception) { Log.w(TAG, "GifAdFramePlayer.release threw", e) }
            }
            gifPlayers.clear()
            synchronized(pendingGifPlayers) {
                for (player in pendingGifPlayers.values) {
                    try { player.release() } catch (e: Exception) { /* ignore */ }
                }
                pendingGifPlayers.clear()
            }

            for (bitmap in pendingBitmaps.values) {
                bitmap.recycle()
            }
            pendingBitmaps.clear()

        } catch (e: GlUtil.GlException) {
            throw VideoFrameProcessingException(e)
        }
        videoProgram = null
        overlayProgram = null
        super.release()
    }

    companion object {
        /** Anisotropic filtering extension constant (mirrors GifAdFramePlayer). */
        private const val GL_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE

        /**
         * Texture coordinates for a quad in TRIANGLE_FAN order with a homogeneous `w=1`.
         * Constant across all overlays and all frames — hoisted out of [drawOverlay] to avoid
         * a 16-float allocation per overlay per frame.
         */
        private val OVERLAY_TEX_COORDS = floatArrayOf(
            0f, 0f, 1f, 1f,
            1f, 0f, 1f, 1f,
            1f, 1f, 1f, 1f,
            0f, 1f, 1f, 1f
        )

        private const val VIDEO_VERTEX_SHADER = """
            attribute vec4 aPosition;
            attribute vec4 aTexCoord;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = aPosition;
                vTexCoord = aTexCoord.xy;
            }
        """

        private const val VIDEO_FRAGMENT_SHADER = """
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uTexSampler;
            void main() {
                gl_FragColor = texture2D(uTexSampler, vTexCoord);
            }
        """

        private const val OVERLAY_VERTEX_SHADER = """
            attribute vec4 aPosition;
            attribute vec4 aTexCoord;
            varying vec2 vTexCoord;
            void main() {
                gl_Position = aPosition;
                vTexCoord = aTexCoord.xy;
            }
        """

        private const val OVERLAY_FRAGMENT_SHADER = """
            #extension GL_OES_standard_derivatives : enable
            precision mediump float;
            varying vec2 vTexCoord;
            uniform sampler2D uAdTexture;
            uniform float uBrightness;
            uniform int uEnableInnerShadow;
            uniform int uSamplesX;
            uniform int uSamplesY;

            void main() {
                vec2 duvdx = dFdx(vTexCoord);
                vec2 duvdy = dFdy(vTexCoord);

                vec4 finalColor = vec4(0.0);
                int totalSamples = uSamplesX * uSamplesY;
                float alpha = 0.0;

                for (int i = 0; i < 4; i++) {
                    if (i >= uSamplesX) break;
                    for (int j = 0; j < 4; j++) {
                        if (j >= uSamplesY) break;
                        vec2 offset = (vec2(float(i), float(j)) + 0.5) / vec2(float(uSamplesX), float(uSamplesY)) - 0.5;
                        offset = offset * 4.0;
                        vec2 sampleTexCoord = vTexCoord + offset.x * duvdx + offset.y * duvdy;

                        if (sampleTexCoord.x >= 0.0 && sampleTexCoord.x <= 1.0 &&
                            sampleTexCoord.y >= 0.0 && sampleTexCoord.y <= 1.0) {
                            alpha += 1.0;
                        }
                    }
                }

                finalColor = texture2D(uAdTexture, vTexCoord);
                finalColor.rgb *= uBrightness;

                if (uEnableInnerShadow == 1) {
                    vec2 grad = vec2(length(duvdx), length(duvdy));
                    vec2 dist = min(vTexCoord, 1.0 - vTexCoord);
                    vec2 edgeDist = dist / grad;

                    float shadowWidth = 10.0;
                    float shadowOpacity = 0.2;

                    vec2 shadowFactor = 1.0 - smoothstep(0.0, shadowWidth, edgeDist);
                    float shadow = max(shadowFactor.x, shadowFactor.y) * shadowOpacity;
                    finalColor.rgb *= (1.0 - shadow);
                }

                finalColor.a = finalColor.a * alpha / float(totalSamples);

                if (finalColor.a > 0.0) {
                    gl_FragColor = finalColor;
                } else {
                    discard;
                }
            }
        """
    }
}