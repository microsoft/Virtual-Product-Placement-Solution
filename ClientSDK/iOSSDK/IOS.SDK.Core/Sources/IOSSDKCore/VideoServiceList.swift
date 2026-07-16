//
//  VideoServiceList.swift
//  IOSSDKCore
//
//  Model + bundle loader for `ServiceConfigs.json` — the multi-entry
//  catalog of remote videos consumed by the host apps' "Review Videos"
//  screen. Each entry pairs a remote mp4 URL with the credentials needed
//  to fetch its ad manifest from the ad backend.
//

import Foundation

// MARK: - Single video entry

/// One remote video registered in `ServiceConfigs.json`. The `videoUrl`
/// points at the mp4 stream to play; `pubVideoId` + `secretKey` are used to
/// fetch the matching ad-insertion manifest via `AllProcessService`.
public struct VideoServiceEntry: Codable, Hashable, Identifiable, Sendable {
    public let pubVideoId: String
    public let secretKey: String
    public let videoUrl: String

    /// Optional overrides — mirror the fields supported by the single-entry
    /// `ServiceConfig.json` (consumed by `AdServiceConfig.loadFromBundle`).
    /// Any missing field falls back to the defaults baked into
    /// `AdServiceConfig.init`.
    public let clientType: String?
    public let userLabel: [String]?
    public let version: String?
    public let apiHost: String?
    public let logHost: String?

    public var id: String { pubVideoId }

    public init(
        pubVideoId: String,
        secretKey: String,
        videoUrl: String,
        clientType: String? = nil,
        userLabel: [String]? = nil,
        version: String? = nil,
        apiHost: String? = nil,
        logHost: String? = nil
    ) {
        self.pubVideoId = pubVideoId
        self.secretKey = secretKey
        self.videoUrl = videoUrl
        self.clientType = clientType
        self.userLabel = userLabel
        self.version = version
        self.apiHost = apiHost
        self.logHost = logHost
    }

    /// Build an `AdServiceConfig` for this entry, applying the defaults
    /// already encoded in `AdServiceConfig.init`.
    public func makeServiceConfig() -> AdServiceConfig {
        // Only pass non-nil overrides so `AdServiceConfig.init`'s default
        // arguments fill in the rest. Apple's default-arg behavior makes
        // this a little verbose, but it keeps the host/version fallbacks
        // owned by a single source of truth.
        AdServiceConfig(
            pubVideoId: pubVideoId,
            secretKey: secretKey,
            clientType: clientType ?? "mobile",
            userLabel: userLabel ?? [],
            version: version ?? "1.0.0",
            apiHost: apiHost ?? DefaultHosts.api,
            logHost: logHost ?? DefaultHosts.log
        )
    }
}

// MARK: - Multi-entry catalog

/// JSON shape of `ServiceConfigs.json` — a list of remote videos with the
/// credentials needed to resolve each one's ad manifest.
public struct VideoServiceList: Codable, Sendable {
    public let videoServices: [VideoServiceEntry]

    public init(videoServices: [VideoServiceEntry]) {
        self.videoServices = videoServices
    }

    /// Load `ServiceConfigs.json` from the given bundle (defaults to
    /// `.main`). Returns `nil` if the file is missing or fails to parse.
    public static func loadFromBundle(
        _ bundle: Bundle = .main,
        resource: String = "ServiceConfigs",
        ext: String = "json"
    ) -> VideoServiceList? {
        guard let url = bundle.url(forResource: resource, withExtension: ext) else {
            dlog("⚠️ VideoServiceList.loadFromBundle: '\(resource).\(ext)' not found in bundle.")
            return nil
        }
        do {
            let data = try Data(contentsOf: url)
            let list = try JSONDecoder().decode(VideoServiceList.self, from: data)
            dlog("📄 \(url.lastPathComponent) loaded: \(list.videoServices.count) video(s)")
            return list
        } catch {
            dlog("⚠️ Failed to load \(resource).\(ext): \(error)")
            return nil
        }
    }
}
