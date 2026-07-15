// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

package com.microsoft.varender.data

/**
 * Backend environment configuration.
 *
 * Use [PROD] for production traffic, [DEV] for development / staging testing.
 * For custom hosts, construct your own [Hosts] via [Environment.custom].
 */
enum class Environment(val hosts: Hosts) {
    PROD(
        Hosts(
            apiHost = "https://prodvafusionapi-g4dghgdmdkejandq.eastasia-01.azurewebsites.net",
            logHost = "https://prodvafusionlogapi-a4c9e3bjdgchctae.eastasia-01.azurewebsites.net"
        )
    ),
    DEV(
        Hosts(
            apiHost = "https://devvafusionapi-eqa8dmdyemg3hue5.eastasia-01.azurewebsites.net",
            logHost = "https://vafusionlogapi-arhmhfeye9h6hved.eastasia-01.azurewebsites.net"
        )
    );

    companion object {
        /**
         * Build a custom environment with explicit host URLs (e.g. for self-hosted / staging).
         */
        @JvmStatic
        fun custom(apiHost: String, logHost: String): Hosts = Hosts(apiHost, logHost)
    }
}

/**
 * Pair of API/log host URLs used by [com.microsoft.varender.data.AllProcessService]
 * and [com.microsoft.varender.data.UploadImpressionService].
 */
data class Hosts(
    val apiHost: String,
    val logHost: String
)