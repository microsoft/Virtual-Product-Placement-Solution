// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

package com.microsoft.varender.effect

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.opengl.GLES20
import android.opengl.GLUtils
import android.util.Log
import com.microsoft.varender.data.AdColor
import pl.droidsonroids.gif.GifDrawable
import java.io.ByteArrayOutputStream
import java.net.URL
import java.nio.ByteBuffer

/**
 * Plays an animated GIF as a synchronized stream of GL textures driven by the host
 * video's frame index.
 *
 * Optimizations in this implementation (vs. the naive "alloc + delete each frame" model):
 *  - **Texture object pool** — pre-allocates [effectiveMaxCachedTextures] GL textures with
 *    fixed `canvasWidth × canvasHeight` storage and uses `glTexSubImage2D` to overwrite
 *    pixel contents on LRU rotation. No `glGenTextures` / `glDeleteTextures` churn after
 *    warmup; no display-driver-side reallocation.
 *  - **MIPMAP + anisotropic filtering** — generates the mip chain so that GIF frames
 *    rendered onto perspective-foreshortened ad quads (e.g. the far end of a tilted
 *    billboard in the video) sample cleanly instead of shimmering / showing moiré
 *    patterns. Anisotropic filtering is applied if the GL_EXT_texture_filter_anisotropic
 *    extension is available.
 *  - **Adaptive sliding-window cache** — small GIFs (≤ [DEFAULT_MAX_CACHED_TEXTURES]
 *    frames) are fully cached; large GIFs (> [LARGE_GIF_THRESHOLD]) use a smaller
 *    sliding window so memory stays bounded.
 *  - **Best-effort prefetch** — periodically warms up the next likely frame so that
 *    forward playback doesn't hit a cold cache + decode + upload spike in `drawFrame`.
 *  - **Pre-cache hook** — [preCacheFrame] lets the parent shader program prime frame 0
 *    on the GL thread before the first render call to avoid first-paint jank.
 *
 * Lifecycle:
 *  - Build with the **raw GIF bytes** already downloaded (see [downloadAndDecode]).
 *  - On the GL thread, call [getTextureForVideoFrame] every render call.
 *  - Optionally call [preCacheFrame] right after construction on the GL thread.
 *  - Call [release] on the GL thread when the parent shader program tears down.
 *
 * Frame timing model (mirrors `H5Player/src/lib/GifAdPlayer.ts`):
 *   elapsedMs = (videoFrameIndex - adStartFrame) / videoFps * 1000
 *   loopedMs  = elapsedMs mod totalDuration
 *   pick the GIF frame whose cumulative time window contains loopedMs (binary search).
 *
 * @param gifDrawable already-decoded [GifDrawable]. The player owns it and recycles it in [release].
 * @param adUnitRatio target aspect ratio of the ad slot. Each GIF frame is letter-boxed
 *                    (with optional [color] fill) to match the ratio so the perspective
 *                    quad maps without distortion.
 * @param color       optional fixed letter-box fill color. When null, edge-color averaging
 *                    is used (matching the image-path behavior).
 * @param maxCachedTexturesHint hard cap on simultaneously cached GL textures. The actual
 *                    cap is `min(frameCount, maxCachedTexturesHint)` for small GIFs or
 *                    a smaller sliding window for very large GIFs.
 */
class GifAdFramePlayer(
    private val gifDrawable: GifDrawable,
    private val adUnitRatio: Float,
    private val color: AdColor?,
    private val maxCachedTexturesHint: Int = DEFAULT_MAX_CACHED_TEXTURES
) {
    private data class FrameInfo(
        val delayMs: Int,
        val cumulativeMs: Int
    )

    private data class TextureEntry(
        val texId: Int,
        var lastUsedNs: Long
    )

    private val frameCount: Int = gifDrawable.numberOfFrames
    private val gifWidth: Int = gifDrawable.intrinsicWidth
    private val gifHeight: Int = gifDrawable.intrinsicHeight

    /** Per-frame timing table. `cumulativeMs[i]` = time at which frame i becomes visible. */
    private val frames: List<FrameInfo>

    /** Total GIF loop duration in ms (sum of all frame delays). 0 → static GIF (1 frame). */
    val totalDurationMs: Int

    /**
     * Letter-boxed bitmap dimensions (== gif dims if ratio matches; else taller/wider).
     * Computed eagerly in a property initializer so that downstream initializers (e.g.
     * [texturePool]) can read the final values without going through an init block first.
     */
    private val letterBoxGeom: IntArray = run {
        val imgRatio = gifWidth.toFloat() / gifHeight.toFloat()
        var cw = gifWidth
        var ch = gifHeight
        if (imgRatio > adUnitRatio) {
            ch = Math.round(gifWidth / adUnitRatio)
        } else if (imgRatio < adUnitRatio) {
            cw = Math.round(gifHeight * adUnitRatio)
        }
        intArrayOf(cw, ch, (cw - gifWidth) / 2, (ch - gifHeight) / 2)
    }
    private val canvasWidth: Int get() = letterBoxGeom[0]
    private val canvasHeight: Int get() = letterBoxGeom[1]
    private val offsetX: Int get() = letterBoxGeom[2]
    private val offsetY: Int get() = letterBoxGeom[3]

    /**
     * Adaptive cache size:
     *   - frameCount ≤ DEFAULT_MAX_CACHED_TEXTURES → cache all frames
     *   - DEFAULT_MAX_CACHED_TEXTURES < frameCount ≤ LARGE_GIF_THRESHOLD → cache DEFAULT (30)
     *   - frameCount > LARGE_GIF_THRESHOLD → sliding window of SLIDING_WINDOW_SIZE (20)
     */
    private val effectiveMaxCachedTextures: Int = when {
        frameCount <= maxCachedTexturesHint -> frameCount
        frameCount <= LARGE_GIF_THRESHOLD -> maxCachedTexturesHint
        else -> SLIDING_WINDOW_SIZE
    }

    /** LRU texture cache: GIF frame index → cached entry. accessOrder=true → eldest=head. */
    private val textureCache = LinkedHashMap<Int, TextureEntry>(effectiveMaxCachedTextures, 0.75f, true)

    /** Pool of pre-allocated, fixed-size GL texture objects ready for [glTexSubImage2D] overwrite. */
    private val texturePool = TexturePool(
        maxSize = effectiveMaxCachedTextures,
        width = canvasWidth,
        height = canvasHeight,
        useMipmap = USE_MIPMAP
    )

    /** Cached letter-box edge colors (computed once on first frame). null when [color] is supplied. */
    private var topBottomFillColor: Int = Color.BLACK
    private var leftRightFillColor: Int = Color.BLACK
    private var edgeColorsComputed: Boolean = false

    /** Reusable letter-box scratch bitmap (avoid per-frame allocation for large GIFs). */
    private var scratchLetterBox: Bitmap? = null

    /** Last video frame at which we ran a forward prefetch (avoid prefetching every render call). */
    private var lastPrefetchVideoFrame: Int = -PREFETCH_INTERVAL_FRAMES

    init {
        require(frameCount >= 1) { "GIF must have at least one frame" }

        // Build per-frame cumulative timing table.
        var cumulative = 0
        val list = ArrayList<FrameInfo>(frameCount)
        for (i in 0 until frameCount) {
            val raw = try { gifDrawable.getFrameDuration(i) } catch (e: Exception) { 0 }
            val delay = if (raw <= 0) 100 else raw
            list.add(FrameInfo(delayMs = delay, cumulativeMs = cumulative))
            cumulative += delay
        }
        frames = list
        totalDurationMs = if (cumulative == 0) 100 else cumulative

        // Letter-box geometry is computed in the [letterBoxGeom] property initializer above
        // (must run before [texturePool] which depends on canvasWidth/canvasHeight).

        Log.d(
            TAG,
            "GifAdFramePlayer init: frames=$frameCount gif=${gifWidth}x${gifHeight} " +
                "canvas=${canvasWidth}x${canvasHeight} cacheCap=$effectiveMaxCachedTextures " +
                "totalDurationMs=$totalDurationMs ratio=$adUnitRatio mipmap=$USE_MIPMAP"
        )
    }

    /**
     * Map a video frame index to the GIF frame index that should be shown.
     * Returns a value in `[0, frameCount)`.
     */
    fun getGifFrameIndex(videoFrameIndex: Int, adStartFrame: Int, videoFps: Float): Int {
        if (frameCount <= 1 || totalDurationMs <= 0 || videoFps <= 0f) return 0
        val relative = videoFrameIndex - adStartFrame
        if (relative <= 0) return 0

        val safeFps = videoFps.toInt().coerceAtLeast(1)
        val elapsedMs = (relative.toLong() * 1000L / safeFps).toInt()
        val loopedMs = ((elapsedMs % totalDurationMs) + totalDurationMs) % totalDurationMs

        // Binary search: largest i where frames[i].cumulativeMs <= loopedMs
        var lo = 0
        var hi = frames.size - 1
        while (lo < hi) {
            val mid = (lo + hi + 1) ushr 1
            if (frames[mid].cumulativeMs <= loopedMs) {
                lo = mid
            } else {
                hi = mid - 1
            }
        }
        return lo
    }

    /**
     * Returns the GL texture id for the GIF frame that should be shown for the given
     * `videoFrameIndex`. Lazily creates/recycles textures via the internal pool.
     *
     * Also opportunistically prefetches the next forward frame (best-effort).
     *
     * Must be called on the GL thread.
     *
     * @return positive GL texture id, or 0 on failure.
     */
    fun getTextureForVideoFrame(videoFrameIndex: Int, adStartFrame: Int, videoFps: Float): Int {
        val gifFrameIndex = getGifFrameIndex(videoFrameIndex, adStartFrame, videoFps)
        val texId = getOrCreateTexture(gifFrameIndex)

        // Best-effort prefetch of next likely frame (rate-limited to PREFETCH_INTERVAL_FRAMES).
        if (frameCount > 1 && videoFrameIndex - lastPrefetchVideoFrame >= PREFETCH_INTERVAL_FRAMES) {
            val nextGifIdx = (gifFrameIndex + 1) % frameCount
            if (!textureCache.containsKey(nextGifIdx)) {
                try {
                    getOrCreateTexture(nextGifIdx)
                } catch (e: Exception) {
                    Log.v(TAG, "prefetch failed: ${e.message}")
                }
            }
            lastPrefetchVideoFrame = videoFrameIndex
        }

        return texId
    }

    /**
     * Eagerly upload one frame so it is hot in the cache before the first render call.
     * Call on the GL thread.
     */
    fun preCacheFrame(gifFrameIndex: Int) {
        if (gifFrameIndex !in 0 until frameCount) return
        getOrCreateTexture(gifFrameIndex)
    }

    private fun getOrCreateTexture(gifFrameIndex: Int): Int {
        val cached = textureCache[gifFrameIndex]
        if (cached != null) {
            cached.lastUsedNs = System.nanoTime()
            return cached.texId
        }

        // Evict (return to pool) before allocating if at capacity.
        if (textureCache.size >= effectiveMaxCachedTextures) {
            evictLruToPool()
        }

        val frameBitmap = try {
            gifDrawable.seekToFrameAndGet(gifFrameIndex)
        } catch (e: Exception) {
            Log.w(TAG, "seekToFrameAndGet failed for index=$gifFrameIndex: ${e.message}")
            return 0
        } ?: return 0

        val composed = composeLetterBoxed(frameBitmap)
        val texId = uploadBitmapToPooledTexture(composed)
        // Don't recycle frameBitmap — GifDrawable owns it.
        // Don't recycle composed if it IS the scratch (we want to reuse).
        if (composed !== scratchLetterBox) {
            composed.recycle()
        }

        if (texId != 0) {
            textureCache[gifFrameIndex] = TextureEntry(texId, System.nanoTime())
        }
        return texId
    }

    private fun composeLetterBoxed(frameBitmap: Bitmap): Bitmap {
        // Fast path: ratio already matches, no letter-box needed.
        if (canvasWidth == gifWidth && canvasHeight == gifHeight) {
            // Use scratch bitmap to avoid per-frame allocation. Copy frameBitmap pixels into it.
            val scratch = ensureScratch()
            val canvas = Canvas(scratch)
            // Clear (the previous frame's pixels are still there)
            canvas.drawColor(Color.TRANSPARENT, android.graphics.PorterDuff.Mode.CLEAR)
            canvas.drawBitmap(frameBitmap, 0f, 0f, null)
            return scratch
        }

        val scratch = ensureScratch()
        val canvas = Canvas(scratch)

        if (color != null) {
            fillWithCustomColor(canvas)
        } else {
            if (!edgeColorsComputed) {
                computeEdgeColors(frameBitmap)
                edgeColorsComputed = true
            }
            fillEdges(canvas)
        }
        canvas.drawBitmap(frameBitmap, offsetX.toFloat(), offsetY.toFloat(), null)
        return scratch
    }

    private fun ensureScratch(): Bitmap {
        val s = scratchLetterBox
        if (s != null && !s.isRecycled && s.width == canvasWidth && s.height == canvasHeight) {
            return s
        }
        val fresh = Bitmap.createBitmap(canvasWidth, canvasHeight, Bitmap.Config.ARGB_8888)
        scratchLetterBox = fresh
        return fresh
    }

    private fun fillWithCustomColor(canvas: Canvas) {
        val c = color ?: return
        val paint = Paint().apply {
            this.color = Color.argb((c.a * 255).toInt().coerceIn(0, 255), c.r, c.g, c.b)
        }
        canvas.drawRect(0f, 0f, canvasWidth.toFloat(), offsetY.toFloat(), paint)
        canvas.drawRect(
            0f, (offsetY + gifHeight).toFloat(),
            canvasWidth.toFloat(), canvasHeight.toFloat(), paint
        )
        canvas.drawRect(0f, offsetY.toFloat(), offsetX.toFloat(), (offsetY + gifHeight).toFloat(), paint)
        canvas.drawRect(
            (offsetX + gifWidth).toFloat(), offsetY.toFloat(),
            canvasWidth.toFloat(), (offsetY + gifHeight).toFloat(), paint
        )
    }

    private fun fillEdges(canvas: Canvas) {
        val paintH = Paint().apply { color = topBottomFillColor }
        canvas.drawRect(0f, 0f, canvasWidth.toFloat(), offsetY.toFloat(), paintH)
        canvas.drawRect(
            0f, (offsetY + gifHeight).toFloat(),
            canvasWidth.toFloat(), canvasHeight.toFloat(), paintH
        )
        val paintV = Paint().apply { color = leftRightFillColor }
        canvas.drawRect(0f, offsetY.toFloat(), offsetX.toFloat(), (offsetY + gifHeight).toFloat(), paintV)
        canvas.drawRect(
            (offsetX + gifWidth).toFloat(), offsetY.toFloat(),
            canvasWidth.toFloat(), (offsetY + gifHeight).toFloat(), paintV
        )
    }

    private fun computeEdgeColors(bmp: Bitmap) {
        val top = averageColor(bmp, 0, 0, bmp.width, 1)
        val bottom = averageColor(bmp, 0, bmp.height - 1, bmp.width, 1)
        topBottomFillColor = mixColor(top, bottom)

        val sampleW = minOf(10, bmp.width / 10).coerceAtLeast(1)
        val left = averageColor(bmp, 0, 0, sampleW, bmp.height)
        val right = averageColor(bmp, bmp.width - sampleW, 0, sampleW, bmp.height)
        leftRightFillColor = mixColor(left, right)
    }

    private fun averageColor(bmp: Bitmap, x: Int, y: Int, w: Int, h: Int): Int {
        val safeW = minOf(w, bmp.width - x)
        val safeH = minOf(h, bmp.height - y)
        if (safeW <= 0 || safeH <= 0) return Color.BLACK
        var r = 0L; var g = 0L; var b = 0L; var count = 0L
        val row = IntArray(safeW)
        for (py in y until y + safeH) {
            bmp.getPixels(row, 0, safeW, x, py, safeW, 1)
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

    private fun mixColor(a: Int, b: Int): Int = Color.rgb(
        (Color.red(a) + Color.red(b)) / 2,
        (Color.green(a) + Color.green(b)) / 2,
        (Color.blue(a) + Color.blue(b)) / 2
    )

    /**
     * Acquire a pooled GL texture and overwrite its contents with [bmp] using
     * `glTexSubImage2D` (no storage reallocation). Regenerates mipmap if enabled.
     */
    private fun uploadBitmapToPooledTexture(bmp: Bitmap): Int {
        val texId = texturePool.acquire()
        if (texId == 0) return 0
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texId)
        // Sub-image upload: storage was already allocated by TexturePool.allocateNew.
        GLUtils.texSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, bmp)
        if (USE_MIPMAP) {
            GLES20.glGenerateMipmap(GLES20.GL_TEXTURE_2D)
        }
        return texId
    }

    private fun evictLruToPool() {
        val it = textureCache.entries.iterator()
        if (it.hasNext()) {
            val oldest = it.next()
            texturePool.release(oldest.value.texId)
            it.remove()
        }
    }

    /**
     * Release GL textures and the underlying [GifDrawable]. Must be called on the GL thread
     * (so glDeleteTextures has a valid context).
     */
    fun release() {
        // Move all live textures back to the pool, then dispose the pool entirely.
        for (entry in textureCache.values) {
            texturePool.release(entry.texId)
        }
        textureCache.clear()
        texturePool.disposeAll()

        scratchLetterBox?.recycle()
        scratchLetterBox = null

        try {
            gifDrawable.recycle()
        } catch (e: Exception) {
            Log.w(TAG, "GifDrawable.recycle threw: ${e.message}")
        }
    }

    /**
     * Pool of fixed-size GL texture objects. Reusing them avoids both `glDeleteTextures`/
     * `glGenTextures` churn and (more importantly) driver-side storage reallocation.
     * Each pooled texture has its parameters (wrap, filter, anisotropy) baked in at creation
     * time and its full RGBA storage allocated once via `glTexImage2D(width, height, null)`.
     */
    private class TexturePool(
        private val maxSize: Int,
        private val width: Int,
        private val height: Int,
        private val useMipmap: Boolean
    ) {
        private val freeIds: ArrayDeque<Int> = ArrayDeque(maxSize)
        private val allIds: MutableList<Int> = ArrayList(maxSize)
        private var anisotropyApplied: Float = 0f

        fun acquire(): Int {
            if (freeIds.isNotEmpty()) return freeIds.removeFirst()
            // Pool capacity is bounded by maxSize; if all are in use we still allocate
            // (this should not happen in normal operation since the LRU evicts in lockstep).
            if (allIds.size >= maxSize) {
                Log.w(TAG, "TexturePool over-capacity (${allIds.size}/$maxSize), allocating extra")
            }
            return allocateNew()
        }

        fun release(id: Int) {
            // Only keep textures that are part of the pool (defensive).
            if (id == 0) return
            if (freeIds.size < maxSize) {
                freeIds.addLast(id)
            } else {
                // Pool already full → delete this orphan.
                val arr = intArrayOf(id)
                GLES20.glDeleteTextures(1, arr, 0)
                allIds.remove(id)
            }
        }

        fun disposeAll() {
            if (allIds.isNotEmpty()) {
                val arr = allIds.toIntArray()
                GLES20.glDeleteTextures(arr.size, arr, 0)
                allIds.clear()
            }
            freeIds.clear()
        }

        private fun allocateNew(): Int {
            val ids = IntArray(1)
            GLES20.glGenTextures(1, ids, 0)
            val texId = ids[0]
            if (texId == 0) {
                Log.e(TAG, "glGenTextures returned 0")
                return 0
            }
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texId)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
            if (useMipmap) {
                GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR_MIPMAP_LINEAR)
            } else {
                GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
            }
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)

            // Apply anisotropic filtering if supported (one-time query cached statically).
            val aniso = getMaxAnisotropy()
            if (aniso > 1f) {
                GLES20.glTexParameterf(GLES20.GL_TEXTURE_2D, GL_TEXTURE_MAX_ANISOTROPY_EXT, aniso)
                anisotropyApplied = aniso
            }

            // Allocate storage with null pixels — actual content is uploaded later via texSubImage2D.
            GLES20.glTexImage2D(
                GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, width, height, 0,
                GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null as ByteBuffer?
            )

            allIds.add(texId)
            return texId
        }
    }

    companion object {
        private const val TAG = "GifAdFramePlayer"

        /**
         * Max cache size for small/medium GIFs. Mirrors H5Player's GifAdPlayer.MAX_CACHE_SIZE.
         * For frameCount ≤ this value, all frames are cached.
         */
        const val DEFAULT_MAX_CACHED_TEXTURES = 30

        /**
         * Frame count threshold above which we switch to a smaller sliding window
         * to bound memory regardless of GIF length.
         */
        const val LARGE_GIF_THRESHOLD = 60

        /**
         * Sliding window size used when frameCount > [LARGE_GIF_THRESHOLD].
         * Big enough to absorb forward playback + 1 prefetch round.
         */
        const val SLIDING_WINDOW_SIZE = 20

        /** Only run a forward prefetch every N video frames (avoid prefetching every render call). */
        const val PREFETCH_INTERVAL_FRAMES = 5

        /** Enable mipmap + trilinear filtering. Helps clarity on perspective-foreshortened ad quads. */
        const val USE_MIPMAP = true

        // anisotropic filtering constants (extension GL_EXT_texture_filter_anisotropic)
        private const val GL_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FE
        private const val GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84FF

        @Volatile private var anisotropyChecked = false
        @Volatile private var cachedMaxAnisotropy = 0f

        /**
         * Query the GL_EXT_texture_filter_anisotropic max level once and cache the result.
         * Must be called on the GL thread (uses glGetString / glGetFloatv).
         */
        fun getMaxAnisotropy(): Float {
            if (!anisotropyChecked) {
                anisotropyChecked = true
                val extensions = try { GLES20.glGetString(GLES20.GL_EXTENSIONS) } catch (_: Exception) { null } ?: ""
                if (extensions.contains("GL_EXT_texture_filter_anisotropic")) {
                    val arr = FloatArray(1)
                    try {
                        GLES20.glGetFloatv(GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT, arr, 0)
                        cachedMaxAnisotropy = arr[0].coerceAtMost(16f)
                        Log.i(TAG, "Anisotropic filtering supported, max=${cachedMaxAnisotropy}")
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to query max anisotropy: ${e.message}")
                    }
                } else {
                    Log.d(TAG, "Anisotropic filtering extension not available")
                }
            }
            return cachedMaxAnisotropy
        }

        /** Magic-byte sniff. Returns true iff [bytes] starts with `GIF87a` or `GIF89a`. */
        fun isGifBytes(bytes: ByteArray): Boolean {
            if (bytes.size < 6) return false
            val header = String(bytes, 0, 6, Charsets.US_ASCII)
            return header == "GIF87a" || header == "GIF89a"
        }

        /**
         * Download the asset at [imageUrl] and, if it is a GIF, decode it eagerly.
         */
        @JvmStatic
        fun downloadAndDecode(imageUrl: String, connectTimeoutMs: Int = 10_000, readTimeoutMs: Int = 10_000): LoadResult? {
            return try {
                val url = URL(imageUrl)
                val connection = url.openConnection()
                connection.connectTimeout = connectTimeoutMs
                connection.readTimeout = readTimeoutMs
                val bytes = connection.getInputStream().use { input ->
                    val buf = ByteArrayOutputStream()
                    input.copyTo(buf)
                    buf.toByteArray()
                }

                if (isGifBytes(bytes)) {
                    val drawable = try {
                        GifDrawable(bytes)
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to decode GIF, falling back to static image: ${e.message}")
                        return LoadResult(bytes, null)
                    }
                    LoadResult(bytes, drawable)
                } else {
                    LoadResult(bytes, null)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to download asset: $imageUrl", e)
                null
            }
        }

        /**
         * Result of [downloadAndDecode]: always contains the raw bytes, and a non-null
         * [gifDrawable] iff the asset is an animated GIF.
         */
        data class LoadResult(
            val bytes: ByteArray,
            val gifDrawable: GifDrawable?
        ) {
            val isGif: Boolean get() = gifDrawable != null

            override fun equals(other: Any?): Boolean = this === other
            override fun hashCode(): Int = System.identityHashCode(this)
        }
    }
}