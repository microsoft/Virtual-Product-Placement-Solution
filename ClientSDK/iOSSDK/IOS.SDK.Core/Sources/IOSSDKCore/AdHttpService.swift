//
//  AdHttpService.swift
//  SimplePlayer.Native
//
//  Swift port of `Reference/H5Player/src/lib/HttpService.ts`:
//
//    - `AllProcessService`       -> fetches the ad-insertion manifest JSON
//    - `UploadImpressionService` -> POSTs impression events
//
//  Mirrors the same endpoints, headers, request bodies and error semantics
//  as the H5Player reference. URLSession replaces axios; otherwise the
//  shape of the API is intentionally identical.
//

import Foundation

// MARK: - Default endpoints

/// Default backend hosts (dev environment). Mirrors the values hard-coded
/// in `Reference/H5Player/src/lib/HttpService.ts`. Anything that needs to
/// hit the ad backend should default to these — no other `https://…`
/// literals should exist in this file.
///
/// Marked `@usableFromInline` so the `public init` default arguments below
/// can reference them without exposing the constants as SDK public API.
@usableFromInline
enum DefaultHosts {
    /// Manifest / preference API.
    /// JiaFuion link
    // @usableFromInline
    // static let api = "https://vafusionapidev-azecadesg9e9defg.eastasia-01.azurewebsites.net"
    /// Impression log API.
    // @usableFromInline
    // static let log = "https://vafusionlogapidev-dseqgpgbcrecfqf4.eastasia-01.azurewebsites.net"

    /// VAFusion
    @usableFromInline
    static let api = "https://devvafusionapi-eqa8dmdyemg3hue5.eastasia-01.azurewebsites.net"
    /// Impression log API.
    @usableFromInline
    static let log = "https://vafusionlogapi-arhmhfeye9h6hved.eastasia-01.azurewebsites.net"
}

// MARK: - Configuration

/// Inputs needed to talk to the production ad backend, mirroring the
/// constructor arguments H5Player's `VideoOverlay` accepts. Default hosts
/// match the dev environment hard-coded in HttpService.ts.
public struct AdServiceConfig {
    public let pubVideoId: String
    public let secretKey: String
    /// "mobile" / "desktop" — H5Player derives this from the user-agent;
    /// iOS is always mobile.
    public let clientType: String
    public let userLabel: [String]
    /// Value sent as `X-Client-Version` on impression uploads.
    public let version: String
    /// API host for manifest fetch.
    public let apiHost: String
    /// Log host for impression uploads.
    public let logHost: String

    public init(
        pubVideoId: String,
        secretKey: String,
        clientType: String = "mobile",
        userLabel: [String] = [],
        version: String = "1.0.0",
        apiHost: String = DefaultHosts.api,
        logHost: String = DefaultHosts.log
    ) {
        self.pubVideoId = pubVideoId
        self.secretKey = secretKey
        self.clientType = clientType
        self.userLabel = userLabel
        self.version = version
        self.apiHost = apiHost
        self.logHost = logHost
    }

    /// JSON shape for the bundled `ServiceConfig.json` file. Every field is
    /// optional except `pubVideoId` + `secretKey`; missing values fall back to
    /// the defaults defined on `AdServiceConfig.init`.
    private struct File: Decodable {
        let pubVideoId: String
        let secretKey: String
        let clientType: String?
        let userLabel: [String]?
        let version: String?
        let apiHost: String?
        let logHost: String?
    }

    /// Load `ServiceConfig.json` from the given bundle (defaults to `.main`).
    /// Returns `nil` if the file is absent or fails to parse; in that case the
    /// caller should treat the app as running in offline/demo mode (bundled
    /// `32.json`).
    public static func loadFromBundle(
        _ bundle: Bundle = .main,
        resource: String = "ServiceConfig",
        ext: String = "json"
    ) -> AdServiceConfig? {
        guard let url = bundle.url(forResource: resource, withExtension: ext) else {
            dlog("⚠️ AdServiceConfig.loadFromBundle: '\(resource).\(ext)' not found in bundle. Make sure the file is included in the app target.")
            return nil
        }
        do {
            let data = try Data(contentsOf: url)
            let file = try JSONDecoder().decode(File.self, from: data)
            let config = AdServiceConfig(
                pubVideoId: file.pubVideoId,
                secretKey: file.secretKey,
                clientType: file.clientType ?? "mobile",
                userLabel: file.userLabel ?? [],
                version: file.version ?? "1.0.0",
                apiHost: file.apiHost ?? DefaultHosts.api,
                logHost: file.logHost ?? DefaultHosts.log
            )
            dlog("📄 ServiceConfig loaded from \(url.lastPathComponent): pubVideoId=\(config.pubVideoId) apiHost=\(config.apiHost)")
            return config
        } catch {
            dlog("⚠️ Failed to load ServiceConfig.json: \(error)")
            return nil
        }
    }
}

// MARK: - Errors

public enum AdServiceError: Error, CustomStringConvertible {
    case badURL(String)
    case httpStatus(Int, body: String?)
    case decodingFailed(Error)
    case transport(Error)

    public var description: String {
        switch self {
        case .badURL(let s): return "Bad URL: \(s)"
        case .httpStatus(let code, let body):
            return "HTTP \(code)\(body.map { ": \($0)" } ?? "")"
        case .decodingFailed(let e): return "Decoding failed: \(e)"
        case .transport(let e): return "Transport error: \(e)"
        }
    }
}

// MARK: - AllProcessService

/// Port of `AllProcessService` in HttpService.ts.
///
/// `POST {apiHost}/api/Preference/pubVideoId/{pubVideoId}/delivery
///       ?clientType=...&userLabel=...`
/// with `secretKey` header. Returns the full `AdManifest` JSON.
public final class AllProcessService {

    private let secretKey: String
    private let host: String
    private let session: URLSession

    public init(
        secretKey: String,
        host: String = DefaultHosts.api,
        session: URLSession? = nil
    ) {
        self.secretKey = secretKey
        self.host = host
        // Default to an ephemeral session so the manifest JSON is never
        // written to URLCache.shared (disk).
        self.session = session ?? URLSession(configuration: .ephemeral)
    }

    /// Convenience initializer using everything in `AdServiceConfig`.
    public convenience init(config: AdServiceConfig, session: URLSession? = nil) {
        self.init(secretKey: config.secretKey, host: config.apiHost, session: session)
    }

    /// Fetch and decode the ad manifest. Throws `AdServiceError`.
    public func getAllProcessedData(
        pubVideoId: String,
        clientType: String,
        userLabel: [String] = []
    ) async throws -> AdManifest {
        let path = "/api/Preference/pubVideoId/\(pubVideoId)/delivery"
        guard var components = URLComponents(string: host + path) else {
            throw AdServiceError.badURL(host + path)
        }
        var query: [URLQueryItem] = [
            URLQueryItem(name: "clientType", value: clientType)
        ]
        // H5Player serializes userLabel as repeated query keys via axios's
        // default `paramsSerializer`. URLComponents does the same with repeats.
        for label in userLabel {
            query.append(URLQueryItem(name: "userLabel", value: label))
        }
        components.queryItems = query
        guard let url = components.url else {
            throw AdServiceError.badURL("\(host)\(path)")
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(secretKey, forHTTPHeaderField: "secretKey")
        // The manifest JSON must never be served from cache: ignore any
        // local/proxy cache entries and force a fresh fetch every time.
        req.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData

        dlog("🌐 AllProcessService.POST \(url.absoluteString)")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            dlog("❌ AllProcessService transport error: \(error)")
            throw AdServiceError.transport(error)
        }

        if let http = response as? HTTPURLResponse {
            dlog("🌐 AllProcessService response: HTTP \(http.statusCode), \(data.count) bytes")
            if !(200...299).contains(http.statusCode) {
                let body = String(data: data, encoding: .utf8)
                dlog("❌ HTTP \(http.statusCode) body: \(body ?? "<binary>")")
                throw AdServiceError.httpStatus(http.statusCode, body: body)
            }
        }

        do {
            return try JSONDecoder().decode(AdManifest.self, from: data)
        } catch {
            // Surface the first 500 bytes of the response so the user can
            // see what shape the server actually returned.
            let preview = String(data: data.prefix(500), encoding: .utf8) ?? "<binary>"
            dlog("❌ AllProcessService decode error: \(error)\n   response preview: \(preview)")
            throw AdServiceError.decodingFailed(error)
        }
    }
}

// MARK: - UploadImpressionService

/// Port of `UploadImpressionService` in HttpService.ts.
///
/// `POST {logHost}/api/AdLog/AdProduct/{adProductId}/Delivery/{deliveryId}/Impression`
/// with `X-Log-Id` (random UUID) and `X-Client-Version` headers.
public final class UploadImpressionService {

    /// Body mirrors `ImpressionBody` in HttpService.ts.
    public struct ImpressionBody: Codable {
        let adId: Int
        let adSlotId: Int
        let imageId: Int
        let scaledFrameCount: Double
        let frameCount: Int
    }

    private let deliveryId: Int
    private let version: String
    private let host: String
    private let session: URLSession

    public init(
        deliveryId: Int,
        version: String,
        host: String = DefaultHosts.log,
        session: URLSession = .shared
    ) {
        self.deliveryId = deliveryId
        self.version = version
        self.host = host
        self.session = session
    }

    /// Convenience initializer that takes the `deliveryId` from a freshly
    /// fetched `AdManifest` and the remaining inputs from `AdServiceConfig`.
    public convenience init(config: AdServiceConfig, deliveryId: Int, session: URLSession = .shared) {
        self.init(
            deliveryId: deliveryId,
            version: config.version,
            host: config.logHost,
            session: session
        )
    }

    /// POST one impression record. Returns the raw response body on success
    /// (typically empty / a status payload); throws `AdServiceError` on failure.
    @discardableResult
    public func uploadImpression(adProductId: Int, logData: ImpressionBody) async throws -> Data {
        let path = "/api/AdLog/AdProduct/\(adProductId)/Delivery/\(deliveryId)/Impression"
        guard let url = URL(string: host + path) else {
            throw AdServiceError.badURL(host + path)
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let logId = UUID().uuidString
        req.setValue(logId, forHTTPHeaderField: "X-Log-Id")
        req.setValue(version, forHTTPHeaderField: "X-Client-Version")
        do {
            req.httpBody = try JSONEncoder().encode(logData)
        } catch {
            throw AdServiceError.decodingFailed(error)
        }

        let bodyString = req.httpBody.flatMap { String(data: $0, encoding: .utf8) } ?? "<nil>"
        dlog("📤 [UploadImpression] POST \(url.absoluteString)")
        dlog("    X-Log-Id=\(logId) X-Client-Version=\(version)")
        dlog("    body=\(bodyString)")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            dlog("❌ [UploadImpression] transport error: \(error)")
            throw AdServiceError.transport(error)
        }
        if let http = response as? HTTPURLResponse {
            let respString = String(data: data, encoding: .utf8) ?? "<binary>"
            if (200...299).contains(http.statusCode) {
                dlog("✅ [UploadImpression] HTTP \(http.statusCode) resp=\(respString)")
            } else {
                dlog("❌ [UploadImpression] HTTP \(http.statusCode) resp=\(respString)")
                throw AdServiceError.httpStatus(http.statusCode, body: respString)
            }
        }
        return data
    }
}
