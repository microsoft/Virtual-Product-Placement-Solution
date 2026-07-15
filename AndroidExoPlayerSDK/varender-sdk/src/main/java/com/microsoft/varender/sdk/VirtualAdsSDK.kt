// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

package com.microsoft.varender.sdk

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.util.UnstableApi
import com.microsoft.varender.data.AllProcessService
import com.microsoft.varender.data.Environment
import com.microsoft.varender.data.ImpressionBody
import com.microsoft.varender.data.OverlayData
import com.microsoft.varender.data.OverlayDataParser
import com.microsoft.varender.data.TrackingInfo
import com.microsoft.varender.data.UploadImpressionService
import com.microsoft.varender.effect.ExposureEvent
import com.microsoft.varender.effect.VirtualAdsEffect
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "VirtualAdsSDK"

/**
 * Main entry point for the Virtual Ads SDK.
 *
 * The SDK mirrors the H5 player's contract:
 *  - Fetches per-video overlay/ad data from `POST /api/Preference/pubVideoId/{id}/delivery`.
 *  - Tracks per-ad-slot exposure as a frame count (scaled by playback speed).
 *  - Uploads each ad-slot impression to
 *    `POST /api/AdLog/AdProduct/{adProductId}/Delivery/{deliveryId}/Impression`.
 *  - No retry/persistence layer — failures are logged and dropped, just like H5.
 *
 * Recommended usage:
 * ```kotlin
 * val sdk = VirtualAdsSDK(
 *     secretKey   = "your-key",
 *     environment = Environment.DEV   // optional, default is DEV
 * )
 *
 * val effect = sdk.loadAndCreateEffect(
 *     publisherVideoId = "1108031483690",
 *     userLabel        = listOf(),
 *     playbackSpeedProvider = { exoPlayer.playbackParameters.speed }
 * )
 *
 * exoPlayer.setVideoEffects(listOf(effect))
 * ```
 *
 * @param secretKey   API access secret key.
 * @param environment Backend environment (PROD or DEV). Defaults to [Environment.DEV].
 * @param logHost     Custom log host URL. Overrides [environment] when non-null.
 * @param apiHost     Custom API host URL. Overrides [environment] when non-null.
 */
@UnstableApi
class VirtualAdsSDK @JvmOverloads constructor(
    private val secretKey: String,
    private val environment: Environment = Environment.DEV,
    apiHost: String? = null,
    logHost: String? = null
) {
    /** Resolved hosts: explicit overrides take precedence over environment defaults. */
    private val resolvedApiHost: String = apiHost ?: environment.hosts.apiHost
    private val resolvedLogHost: String = logHost ?: environment.hosts.logHost

    private var overlayData: OverlayData? = null
    private var trackingInfo: TrackingInfo? = null

    /**
     * Impression service is created lazily once `deliveryId` is known
     * (returned by [loadOverlayData]).
     */
    private var impressionService: UploadImpressionService? = null

    /**
     * Load overlay data from the API. Must be called before [createEffect].
     * This is a suspend function — call from a coroutine.
     *
     * @param publisherVideoId Publisher-side video identifier.
     * @param clientType       Client identifier. Defaults to "mobile" to match H5 behaviour
     *                         (H5 sends "mobile" for non-Windows user agents).
     * @param userLabel        Optional user-label list; appended as repeated query params.
     */
    @JvmOverloads
    suspend fun loadOverlayData(
        publisherVideoId: String,
        clientType: String = "mobile",
        userLabel: List<String> = emptyList()
    ): OverlayData = withContext(Dispatchers.IO) {
        val service = AllProcessService(secretKey, resolvedApiHost)
        val rawData = service.getAllProcessedData(publisherVideoId, clientType, userLabel)
        val parsedData = OverlayDataParser.parse(rawData)
        val tracking = OverlayDataParser.extractTrackingInfo(rawData)

        overlayData = parsedData
        trackingInfo = tracking

        // Spin up the impression service now that we have a deliveryId.
        tracking.deliveryId?.let { deliveryId ->
            impressionService = UploadImpressionService(
                deliveryId = deliveryId,
                version = COMPONENT_VERSION,
                logHost = resolvedLogHost
            )
        }

        Log.i(
            TAG,
            "Overlay data loaded: ${parsedData.elements.size} frames, " +
                    "${parsedData.adSlots.size} ad slots, " +
                    "fps=${parsedData.metadata.fps}, " +
                    "${parsedData.metadata.width}x${parsedData.metadata.height}, " +
                    "deliveryId=${tracking.deliveryId}"
        )

        parsedData
    }

    /**
     * Create a VirtualAdsEffect that can be added to ExoPlayer via setVideoEffects().
     * Call [loadOverlayData] first, or pass pre-loaded data directly.
     *
     * @param data Pre-loaded overlay data (optional if [loadOverlayData] was called).
     * @param enableStartPtsIgnoreEditList Whether to apply igPtsTime offset correction.
     * @param autoUpload When true (default), every emitted [ExposureEvent] is automatically
     *                   uploaded via [uploadExposureLogAsync]. The optional [onExposureEvent]
     *                   callback is still invoked as an observer.
     * @param onExposureEvent Optional callback for ad exposure tracking events. Invoked on
     *                        the GL render thread; avoid long-running work here.
     * @param frameOffsetProvider Optional callback to apply a runtime frame-index offset.
     * @param playbackSpeedProvider Optional callback returning the current playback speed
     *                              (typically `exoPlayer.playbackParameters.speed`).
     *                              `scaledFrameCount` accumulates `1.0 / playbackSpeed` per frame.
     */
    @JvmOverloads
    fun createEffect(
        data: OverlayData? = null,
        enableStartPtsIgnoreEditList: Boolean = true,
        autoUpload: Boolean = true,
        onExposureEvent: ((ExposureEvent) -> Unit)? = null,
        frameOffsetProvider: () -> Int = { 0 },
        playbackSpeedProvider: () -> Float = { 1f }
    ): VirtualAdsEffect {
        val effectData = data ?: overlayData
            ?: throw IllegalStateException("No overlay data available. Call loadOverlayData() first or pass data directly.")

        val combinedCallback: ((ExposureEvent) -> Unit)? =
            if (autoUpload || onExposureEvent != null) {
                { event ->
                    if (autoUpload) {
                        uploadExposureLogAsync(event)
                    }
                    onExposureEvent?.invoke(event)
                }
            } else null

        return VirtualAdsEffect(
            overlayData = effectData,
            enableStartPtsIgnoreEditList = enableStartPtsIgnoreEditList,
            onExposureEvent = combinedCallback,
            frameOffsetProvider = frameOffsetProvider,
            playbackSpeedProvider = playbackSpeedProvider
        )
    }

    /**
     * Convenience: Load data and create effect in one call.
     * This is a suspend function — call from a coroutine.
     */
    @JvmOverloads
    suspend fun loadAndCreateEffect(
        publisherVideoId: String,
        clientType: String = "mobile",
        userLabel: List<String> = emptyList(),
        enableStartPtsIgnoreEditList: Boolean = true,
        autoUpload: Boolean = true,
        onExposureEvent: ((ExposureEvent) -> Unit)? = null,
        frameOffsetProvider: () -> Int = { 0 },
        playbackSpeedProvider: () -> Float = { 1f }
    ): VirtualAdsEffect {
        val data = loadOverlayData(publisherVideoId, clientType, userLabel)
        return createEffect(
            data = data,
            enableStartPtsIgnoreEditList = enableStartPtsIgnoreEditList,
            autoUpload = autoUpload,
            onExposureEvent = onExposureEvent,
            frameOffsetProvider = frameOffsetProvider,
            playbackSpeedProvider = playbackSpeedProvider
        )
    }

    /**
     * Create a [VirtualAdsEffect] with no overlay data attached yet. Returns immediately
     * (no network call) so the effect can be handed to ExoPlayer BEFORE `prepare()`,
     * which is the only time Media3 will actually wire up the effect pipeline.
     *
     * Until [loadInto] / [loadIntoAsync] (or [VirtualAdsEffect.setOverlayData]) is called,
     * the effect renders as a pure video passthrough — no ad overlays, no exposure events.
     * Once data arrives, ad overlays start appearing on the next frame automatically.
     *
     * This is the recommended pattern when the host player cannot tolerate a 0.5–2 s
     * startup delay waiting for ad data:
     *
     * ```kotlin
     * val effect = sdk.createEmptyEffect(playbackSpeedProvider = { exo.playbackParameters.speed })
     * exo.setVideoEffects(listOf(effect))   // BEFORE prepare()
     * exo.prepare()
     * exo.playWhenReady = true
     * // ... start playback immediately ...
     * sdk.loadIntoAsync(effect, publisherVideoId)   // ads light up when ready
     * ```
     */
    @JvmOverloads
    fun createEmptyEffect(
        enableStartPtsIgnoreEditList: Boolean = true,
        autoUpload: Boolean = true,
        onExposureEvent: ((ExposureEvent) -> Unit)? = null,
        frameOffsetProvider: () -> Int = { 0 },
        playbackSpeedProvider: () -> Float = { 1f }
    ): VirtualAdsEffect {
        val combinedCallback: ((ExposureEvent) -> Unit)? =
            if (autoUpload || onExposureEvent != null) {
                { event ->
                    if (autoUpload) {
                        uploadExposureLogAsync(event)
                    }
                    onExposureEvent?.invoke(event)
                }
            } else null

        return VirtualAdsEffect(
            overlayData = null,
            enableStartPtsIgnoreEditList = enableStartPtsIgnoreEditList,
            onExposureEvent = combinedCallback,
            frameOffsetProvider = frameOffsetProvider,
            playbackSpeedProvider = playbackSpeedProvider
        )
    }

    /**
     * Load overlay data and attach it to an existing [VirtualAdsEffect] (typically one
     * returned by [createEmptyEffect]). Suspend function — call from a coroutine.
     *
     * On success the effect will start rendering ad overlays on the next frame.
     * On failure the effect stays in passthrough mode (the exception is propagated to
     * the caller; the GL pipeline is not affected).
     */
    @JvmOverloads
    suspend fun loadInto(
        effect: VirtualAdsEffect,
        publisherVideoId: String,
        clientType: String = "mobile",
        userLabel: List<String> = emptyList()
    ): OverlayData {
        val data = loadOverlayData(publisherVideoId, clientType, userLabel)
        effect.setOverlayData(data)
        return data
    }


    /**
     * Upload an ad exposure impression to the backend.
     *
     * Mirrors H5 semantics: no retry, no persistence. Errors are swallowed and logged.
     *
     * @return true if the request was issued successfully, false otherwise.
     */
    suspend fun uploadExposureLog(event: ExposureEvent): Boolean {
        Log.d(
            TAG,
            "uploadExposureLog: slot='${event.adSlotIndex}' frames=${event.frameCount} " +
                    "scaled=${event.scaledFrameCount}"
        )

        val data = overlayData ?: run {
            Log.w(TAG, "uploadExposureLog skipped — overlayData is null (loadOverlayData not called?)")
            return false
        }
        val service = impressionService ?: run {
            Log.w(
                TAG,
                "uploadExposureLog skipped — impressionService is null " +
                        "(deliveryId missing in response? trackingInfo=${trackingInfo})"
            )
            return false
        }
        val adSlot = data.adSlots[event.adSlotIndex] ?: run {
            Log.w(
                TAG,
                "uploadExposureLog skipped — unknown adSlotIndex='${event.adSlotIndex}'. " +
                        "Known slots=${data.adSlots.keys}"
            )
            return false
        }

        return try {
            val body = ImpressionBody(
                adId = adSlot.adId,
                adSlotId = adSlot.adSlotId,
                imageId = adSlot.id,
                scaledFrameCount = event.scaledFrameCount,
                frameCount = event.frameCount
            )
            Log.d(
                TAG,
                "uploadExposureLog dispatch: slot='${event.adSlotIndex}' adProductId=${adSlot.adProductId} " +
                        "adId=${adSlot.adId} adSlotId=${adSlot.adSlotId} imageId=${adSlot.id} " +
                        "frames=${event.frameCount} scaled=${event.scaledFrameCount}"
            )
            service.uploadImpression(adSlot.adProductId, body)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to upload exposure data for slot='${event.adSlotIndex}'", e)
            false
        }
    }

    /**
     * Get the loaded tracking info (available after [loadOverlayData]).
     */
    fun getTrackingInfo(): TrackingInfo? = trackingInfo

    /**
     * Get the loaded overlay data (available after [loadOverlayData]).
     */
    fun getOverlayData(): OverlayData? = overlayData

    // =========================================================================
    // Java-friendly callback API
    // =========================================================================

    /**
     * Callback interface for Java callers.
     */
    interface Callback<T> {
        fun onSuccess(result: T)
        fun onError(error: Exception)
    }

    /**
     * Java-friendly: Load overlay data asynchronously with callback.
     * Callbacks are delivered on the main thread.
     */
    @JvmOverloads
    fun loadOverlayDataAsync(
        publisherVideoId: String,
        clientType: String = "mobile",
        userLabel: List<String> = emptyList(),
        callback: Callback<OverlayData>
    ) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val data = loadOverlayData(publisherVideoId, clientType, userLabel)
                Handler(Looper.getMainLooper()).post { callback.onSuccess(data) }
            } catch (e: Exception) {
                Handler(Looper.getMainLooper()).post { callback.onError(e) }
            }
        }
    }

    /**
     * Java-friendly: Load data and create effect in one call with callback.
     * Callbacks are delivered on the main thread.
     */
    @JvmOverloads
    fun loadAndCreateEffectAsync(
        publisherVideoId: String,
        clientType: String = "mobile",
        userLabel: List<String> = emptyList(),
        enableStartPtsIgnoreEditList: Boolean = true,
        autoUpload: Boolean = true,
        onExposureEvent: ExposureEventListener? = null,
        frameOffsetProvider: FrameOffsetProvider? = null,
        playbackSpeedProvider: PlaybackSpeedProvider? = null,
        callback: Callback<VirtualAdsEffect>
    ) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val data = loadOverlayData(publisherVideoId, clientType, userLabel)
                val effect = createEffect(
                    data = data,
                    enableStartPtsIgnoreEditList = enableStartPtsIgnoreEditList,
                    autoUpload = autoUpload,
                    onExposureEvent = onExposureEvent?.let { listener ->
                        { event: ExposureEvent -> listener.onExposure(event) }
                    },
                    frameOffsetProvider = frameOffsetProvider?.let { p -> { p.getFrameOffset() } } ?: { 0 },
                    playbackSpeedProvider = playbackSpeedProvider?.let { p -> { p.getPlaybackSpeed() } } ?: { 1f }
                )
                Handler(Looper.getMainLooper()).post { callback.onSuccess(effect) }
            } catch (e: Exception) {
                Handler(Looper.getMainLooper()).post { callback.onError(e) }
            }
        }
    }

    /**
     * Java-friendly: Upload exposure log asynchronously (fire-and-forget).
     */
    fun uploadExposureLogAsync(event: ExposureEvent) {
        CoroutineScope(Dispatchers.IO).launch {
            uploadExposureLog(event)
        }
    }

    /**
     * Java-friendly: Load overlay data and attach it to the given effect asynchronously.
     *
     * Pairs with [createEmptyEffect] to give Java callers a fully non-blocking path:
     * create the empty effect, hand it to ExoPlayer before `prepare()`, then call this
     * method to fill it in. Callback is delivered on the main thread; pass `null` if you
     * don't need a completion signal.
     */
    @JvmOverloads
    fun loadIntoAsync(
        effect: VirtualAdsEffect,
        publisherVideoId: String,
        clientType: String = "mobile",
        userLabel: List<String> = emptyList(),
        callback: Callback<OverlayData>? = null
    ) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val data = loadInto(effect, publisherVideoId, clientType, userLabel)
                callback?.let { cb ->
                    Handler(Looper.getMainLooper()).post { cb.onSuccess(data) }
                }
            } catch (e: Exception) {
                callback?.let { cb ->
                    Handler(Looper.getMainLooper()).post { cb.onError(e) }
                }
            }
        }
    }

    /**
     * Java-friendly interface for exposure event callbacks.
     */
    fun interface ExposureEventListener {
        fun onExposure(event: ExposureEvent)
    }

    /**
     * Java-friendly interface for providing frame offset at runtime.
     */
    fun interface FrameOffsetProvider {
        fun getFrameOffset(): Int
    }

    /**
     * Java-friendly interface for providing playback speed at runtime.
     * Typically wired up as `() -> exoPlayer.playbackParameters.speed`.
     */
    fun interface PlaybackSpeedProvider {
        fun getPlaybackSpeed(): Float
    }

    companion object {
        /** Bumped to v2.0.0 for H5-aligned frame-count impression upload API. */
        const val COMPONENT_VERSION = "virtual-ads-android-sdk.v2.0.0"
    }
}
