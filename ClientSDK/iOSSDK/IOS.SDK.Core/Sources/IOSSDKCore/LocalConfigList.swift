//
//  LocalConfigList.swift
//  IOSSDKCore
//
//  Catalog of bundled mock ad-manifest JSON files for the "Open Video"
//  two-step picker. Each entry references a `<name>.json` resource that
//  `AdManifestParser` decodes as the mock manifest for a local .mp4.
//

import Foundation

// MARK: - Single manifest entry

/// One entry in `LocalConfigs.json`. `name` is the bundle resource name
/// with `.json` stripped (ready for `Bundle.url(forResource:withExtension:)`).
public struct LocalManifestEntry: Hashable, Identifiable, Sendable {
    public let fileName: String

    public var id: String { fileName }
    public var name: String {
        if fileName.lowercased().hasSuffix(".json") {
            return String(fileName.dropLast(5))
        }
        return fileName
    }
    public var label: String { name }

    public init(fileName: String) {
        self.fileName = fileName
    }
}

// MARK: - Multi-entry catalog

/// `LocalConfigs.json` schema: `{ "config_jsons": ["32.json", "brother29.json"] }`.
public struct LocalConfigList: Sendable {
    public let manifests: [LocalManifestEntry]

    public init(manifests: [LocalManifestEntry]) {
        self.manifests = manifests
    }

    private struct RawSchema: Decodable {
        let config_jsons: [String]
    }

    /// Load `LocalConfigs.json` from `bundle`. `nil` on missing / parse failure.
    public static func loadFromBundle(
        _ bundle: Bundle = .main,
        resource: String = "LocalConfigs",
        ext: String = "json"
    ) -> LocalConfigList? {
        guard let url = bundle.url(forResource: resource, withExtension: ext) else {
            dlog("⚠️ LocalConfigList: '\(resource).\(ext)' not in bundle.")
            return nil
        }
        do {
            let data = try Data(contentsOf: url)
            let raw = try JSONDecoder().decode(RawSchema.self, from: data)
            let entries = raw.config_jsons.map(LocalManifestEntry.init(fileName:))
            dlog("📄 \(url.lastPathComponent): \(entries.count) manifest(s)")
            return LocalConfigList(manifests: entries)
        } catch {
            dlog("⚠️ LocalConfigList decode failed: \(error)")
            return nil
        }
    }
}
