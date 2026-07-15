// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

package com.microsoft.varender.sdk

import okhttp3.OkHttpClient
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Debug-only helpers for the Virtual Ads SDK.
 *
 * **DO NOT CALL FROM RELEASE BUILDS.** These helpers disable TLS certificate
 * validation, which makes the app trivially vulnerable to MITM attacks.
 *
 * Intended use case: running diagnostic builds on corporate guest Wi-Fi
 * (e.g. `msftguest-virtual`) where an SSL bump intercepts every HTTPS
 * connection and replaces the server certificate with the guest portal
 * certificate.
 *
 * Usage (from a debug-only code path such as `Application.onCreate()` guarded
 * by `BuildConfig.DEBUG`):
 *
 * ```java
 * if (BuildConfig.DEBUG) {
 *     VirtualAdsDebug.trustAllCertificates();
 * }
 * ```
 */
object VirtualAdsDebug {

    @Volatile
    private var trustAll: Boolean = false

    @Volatile
    private var trustAllSocketFactory: SSLSocketFactory? = null

    @Volatile
    private var trustAllManager: X509TrustManager? = null

    /**
     * Enable trust-all mode. After this is called, every new [OkHttpClient]
     * built through [applyDebugTrustIfEnabled] will accept any TLS certificate
     * and skip hostname verification.
     *
     * This is process-wide and one-way: once enabled it cannot be disabled
     * (the existing clients have already been built). Call exactly once at
     * process start, before any SDK network call.
     */
    @JvmStatic
    fun trustAllCertificates() {
        if (trustAll) return
        val mgr = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        }
        val ctx = SSLContext.getInstance("TLS")
        ctx.init(null, arrayOf<TrustManager>(mgr), java.security.SecureRandom())
        trustAllManager = mgr
        trustAllSocketFactory = ctx.socketFactory
        trustAll = true
        android.util.Log.w(
            "VirtualAdsDebug",
            "TLS validation DISABLED for VirtualAds SDK OkHttp clients — debug builds ONLY."
        )
    }

    /**
     * Returns `true` once [trustAllCertificates] has been called.
     */
    @JvmStatic
    fun isTrustAllEnabled(): Boolean = trustAll

    /**
     * If [trustAllCertificates] has been called, swap [builder]'s
     * [SSLSocketFactory] and [HostnameVerifier] with permissive variants.
     * Otherwise leaves [builder] untouched.
     *
     * Internal SDK use.
     */
    @JvmStatic
    fun applyDebugTrustIfEnabled(builder: OkHttpClient.Builder): OkHttpClient.Builder {
        val sf = trustAllSocketFactory
        val mgr = trustAllManager
        if (trustAll && sf != null && mgr != null) {
            builder.sslSocketFactory(sf, mgr)
            builder.hostnameVerifier(HostnameVerifier { _, _ -> true })
        }
        return builder
    }
}
