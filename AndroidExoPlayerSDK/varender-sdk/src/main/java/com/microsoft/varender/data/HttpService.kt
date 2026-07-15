// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

package com.microsoft.varender.data

import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import com.microsoft.varender.sdk.VirtualAdsDebug
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * Service for fetching processed overlay data from the Virtual Ads Fusion API.
 *
 * Mirrors the H5 player contract:
 *   POST {apiHost}/api/Preference/pubVideoId/{pubVideoId}/delivery
 *        ?clientType=...&userLabel=...&userLabel=...
 *   (empty body; parameters live in the URL/query string)
 *
 * @param secretKey API access secret key.
 * @param apiHost   Backend API host. Defaults to DEV.
 */
class AllProcessService @JvmOverloads constructor(
    private val secretKey: String,
    private val apiHost: String = Environment.DEV.hosts.apiHost
) {

    private val client = VirtualAdsDebug.applyDebugTrustIfEnabled(
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
    ).build()

    private val gson = Gson()
    private val jsonMediaType = "application/json".toMediaType()

    /**
     * Fetch all processed overlay data for a given video.
     *
     * @param publisherVideoId Publisher-side video identifier (goes into the URL path).
     * @param clientType       e.g. "mobile" / "desktop" / "android".
     * @param userLabel        Optional user-label list; appended as repeated query params.
     */
    suspend fun getAllProcessedData(
        publisherVideoId: String,
        clientType: String,
        userLabel: List<String> = emptyList()
    ): JsonObject = withContext(Dispatchers.IO) {
        val urlBuilder = "$apiHost/api/Preference/pubVideoId/$publisherVideoId/delivery"
            .toHttpUrl()
            .newBuilder()
            .addQueryParameter("clientType", clientType)
        for (label in userLabel) {
            urlBuilder.addQueryParameter("userLabel", label)
        }
        val url = urlBuilder.build()

        // H5 sends `axios.post(url, null, ...)` — no body. OkHttp requires an empty body.
        val emptyBody: RequestBody = ByteArray(0).toRequestBody(jsonMediaType, 0, 0)

        val request = Request.Builder()
            .url(url)
            .addHeader("Content-Type", "application/json")
            .addHeader("secretKey", secretKey)
            .post(emptyBody)
            .build()

        android.util.Log.d("AllProcessService", "POST $url  (secretKey=${secretKey.take(8)}...)")

        val response = client.newCall(request).execute()
        val responseBody = response.body?.string()
        if (!response.isSuccessful) {
            android.util.Log.e(
                "AllProcessService",
                "HTTP ${response.code} ${response.message} -- body: ${responseBody ?: "<null>"}"
            )
            throw Exception(
                "Failed to fetch overlay data: HTTP ${response.code} ${response.message}" +
                        (responseBody?.take(500)?.let { " -- $it" } ?: "")
            )
        }
        if (responseBody.isNullOrEmpty()) {
            throw Exception("Empty response body (HTTP ${response.code})")
        }

        gson.fromJson(responseBody, JsonObject::class.java)
    }
}

/**
 * Service for uploading per-ad-slot frame-count impressions.
 *
 * Mirrors the H5 player contract:
 *   POST {logHost}/api/AdLog/AdProduct/{adProductId}/Delivery/{deliveryId}/Impression
 *   Headers: Content-Type, X-Log-Id (UUID per request), X-Client-Version
 *   Body:    ImpressionBody  { adId, adSlotId, imageId, scaledFrameCount, frameCount }
 *
 * @param deliveryId Delivery identifier returned by [AllProcessService.getAllProcessedData].
 * @param version    Client component version string, sent as `X-Client-Version`.
 * @param logHost    Backend log host. Defaults to DEV.
 */
class UploadImpressionService @JvmOverloads constructor(
    private val deliveryId: Long,
    private val version: String,
    private val logHost: String = Environment.DEV.hosts.logHost
) {

    private val client = VirtualAdsDebug.applyDebugTrustIfEnabled(
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
    ).build()

    private val gson = Gson()
    private val jsonMediaType = "application/json".toMediaType()

    /**
     * Upload a single impression record. Errors are swallowed and logged (mirrors H5 behaviour).
     */
    suspend fun uploadImpression(adProductId: Long, logData: ImpressionBody) = withContext(Dispatchers.IO) {
        val url = "$logHost/api/AdLog/AdProduct/$adProductId/Delivery/$deliveryId/Impression"
        val logId = UUID.randomUUID().toString()
        val bodyJson = gson.toJson(logData)
        val body = bodyJson.toRequestBody(jsonMediaType)

        android.util.Log.d(
            "UploadImpression",
            "POST $url  logId=$logId payload=$bodyJson"
        )

        val request = Request.Builder()
            .url(url)
            .addHeader("Content-Type", "application/json")
            .addHeader("X-Log-Id", logId)
            .addHeader("X-Client-Version", version)
            .post(body)
            .build()

        val startMs = System.currentTimeMillis()
        try {
            val response = client.newCall(request).execute()
            val elapsedMs = System.currentTimeMillis() - startMs
            val respBody = try { response.body?.string() } catch (_: Exception) { null }
            if (response.isSuccessful) {
                android.util.Log.i(
                    "UploadImpression",
                    "OK HTTP ${response.code} logId=$logId elapsedMs=$elapsedMs " +
                            (respBody?.take(200)?.let { "resp=$it" } ?: "resp=<empty>")
                )
            } else {
                android.util.Log.e(
                    "UploadImpression",
                    "FAIL HTTP ${response.code} ${response.message} logId=$logId elapsedMs=$elapsedMs " +
                            "body=${respBody ?: "<null>"}"
                )
            }
            response.close()
        } catch (e: Exception) {
            val elapsedMs = System.currentTimeMillis() - startMs
            android.util.Log.e(
                "UploadImpression",
                "EXCEPTION logId=$logId elapsedMs=$elapsedMs url=$url",
                e
            )
        }
    }
}

/**
 * Parser that converts the raw API JSON response into structured OverlayData.
 */
object OverlayDataParser {

    fun parse(data: JsonObject): OverlayData {
        val elements = mutableMapOf<Int, MutableList<OverlayElement>>()

        val adInstances = data.getAsJsonObject("adInstances")
        val validInstances = adInstances.getAsJsonObject("instance_valid")
        val instances = adInstances.getAsJsonObject("ad_units_instances")

        for ((frame, frameDataElement) in instances.entrySet()) {
            val frameData = frameDataElement.asJsonObject
            for ((id, adDataElement) in frameData.entrySet()) {
                val isValid = validInstances.has(id) && validInstances.get(id).asBoolean
                if (!isValid) continue

                val unitArray = adDataElement.asJsonObject.getAsJsonArray("unit")
                val vertices = (0 until 4).map { i ->
                    val point = unitArray[i].asJsonArray
                    Point2D(point[0].asFloat, point[1].asFloat)
                }

                val frameIndex = frame.toInt()
                elements.getOrPut(frameIndex) { mutableListOf() }
                    .add(OverlayElement(id, vertices))
            }
        }

        val adSlots = mutableMapOf<String, AdSlot>()
        val ads = data.getAsJsonArray("ads")
        for (adElement in ads) {
            val ad = adElement.asJsonObject
            val adIndex = ad.get("adIndex").asString

            val hasColor = !ad.get("red").isJsonNull &&
                    !ad.get("green").isJsonNull &&
                    !ad.get("blue").isJsonNull

            val color = if (hasColor) {
                AdColor(
                    r = ad.get("red").asInt,
                    g = ad.get("green").asInt,
                    b = ad.get("blue").asInt,
                    a = if (ad.has("alpha") && !ad.get("alpha").isJsonNull) ad.get("alpha").asFloat else 1f
                )
            } else null

            adSlots[adIndex] = AdSlot(
                id = ad.get("imageId").asInt,
                adId = ad.get("adId").asInt,
                adProductId = if (ad.has("adProductId") && !ad.get("adProductId").isJsonNull) ad.get("adProductId").asLong else 0L,
                adSlotId = if (ad.has("adSlotId") && !ad.get("adSlotId").isJsonNull) ad.get("adSlotId").asLong else 0L,
                imageUrl = ad.get("imageUrl").asString,
                adUnitRatio = ad.get("adUnitRatio").asFloat,
                color = color,
                brightness = if (ad.has("brightness") && !ad.get("brightness").isJsonNull) ad.get("brightness").asFloat else 1.0f,
                enableInnerShadow = if (ad.has("enableInnerShadow") && !ad.get("enableInnerShadow").isJsonNull) ad.get("enableInnerShadow").asBoolean else false
            )
        }

        val videoMeta = data.getAsJsonObject("videoMeta")
        val igPtsTimeObj = adInstances.getAsJsonObject("ig_pts_time")
        val igPtsTime = if (igPtsTimeObj != null && igPtsTimeObj.has("0")) {
            igPtsTimeObj.get("0").asFloat
        } else 0f

        val metadata = VideoMetadata(
            width = videoMeta.get("width").asInt,
            height = videoMeta.get("height").asInt,
            fps = videoMeta.get("fps").asFloat,
            totalFrames = videoMeta.get("n_frames").asInt,
            igPtsTime = igPtsTime
        )

        return OverlayData(
            elements = elements,
            metadata = metadata,
            adSlots = adSlots
        )
    }

    /**
     * Extract platform-level tracking data from the API response.
     */
    fun extractTrackingInfo(data: JsonObject): TrackingInfo {
        return TrackingInfo(
            platformId = if (data.has("PlatformId") && !data.get("PlatformId").isJsonNull) data.get("PlatformId").asInt else null,
            seriesId = if (data.has("SeriesId") && !data.get("SeriesId").isJsonNull) data.get("SeriesId").asInt else null,
            publisherVideoId = if (data.has("publisherVideoId") && !data.get("publisherVideoId").isJsonNull) data.get("publisherVideoId").asString else null,
            deliveryId = if (data.has("deliveryId") && !data.get("deliveryId").isJsonNull) data.get("deliveryId").asLong else null
        )
    }
}

data class TrackingInfo(
    val platformId: Int?,
    val seriesId: Int?,
    val publisherVideoId: String?,
    val deliveryId: Long?
)
