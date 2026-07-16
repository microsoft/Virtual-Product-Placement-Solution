//
//  AdManifestParser.swift
//  SimplePlayer.Native
//
//  Parses an ad-insertion manifest JSON (e.g. Asset/32.json) into our
//  Swift model (`AdManifest`) and caches the renderer-ready overlay view
//  (`OverlayData`) derived from it.
//

import Foundation

/// Thin wrapper that loads an `AdManifest` JSON file and exposes both
/// the raw decoded model and the derived H5Player-style overlay view.
public final class AdManifestParser {

    // MARK: - Errors

    public enum Error: Swift.Error, CustomStringConvertible {
        case resourceNotFound(name: String, ext: String?, bundle: Bundle)

        public var description: String {
            switch self {
            case let .resourceNotFound(name, ext, bundle):
                let full = ext.map { "\(name).\($0)" } ?? name
                return "AdManifestParser: resource '\(full)' not found in bundle \(bundle.bundleIdentifier ?? bundle.bundlePath)"
            }
        }
    }

    // MARK: - Stored state

    /// Raw decoded manifest.
    public let manifest: AdManifest

    /// Renderer-ready derived view. Built lazily on first access and cached.
    private(set) lazy var overlay: OverlayData = manifest.buildOverlay()

    // MARK: - Init

    /// Wrap an already-decoded manifest.
    public init(manifest: AdManifest) {
        self.manifest = manifest
    }

    /// Decode the manifest from raw JSON bytes.
    public convenience init(data: Data) throws {
        let m = try AdManifest.decode(from: data)
        self.init(manifest: m)
    }

    /// Decode the manifest from a file URL.
    public convenience init(contentsOf url: URL) throws {
        let m = try AdManifest.load(contentsOf: url)
        self.init(manifest: m)
    }

    /// Decode the manifest from a bundled JSON resource.
    /// Pass either a full filename (with extension) or split name + extension.
    public convenience init(
        bundleResource name: String,
        withExtension ext: String? = "json",
        bundle: Bundle = .main
    ) throws {
        guard let url = bundle.url(forResource: name, withExtension: ext) else {
            throw Error.resourceNotFound(name: name, ext: ext, bundle: bundle)
        }
        try self.init(contentsOf: url)
    }

    // MARK: - Convenience accessors

    public var videoMeta: VideoMeta { manifest.videoMeta }
    public var componentConfig: ComponentConfig { manifest.componentConfig }
    public var metadata: VideoOverlayMetadata { overlay.metadata }

    /// All renderer-ready ad slots, sorted by ad index for deterministic order.
    public var allAdSlots: [AdSlot] {
        overlay.adSlots
            .sorted { ($0.key.localizedStandardCompare($1.key)) == .orderedAscending }
            .map { $0.value }
    }

    /// Ad quads visible on the given (integer) frame index. Empty if none.
    public func elements(atFrame frame: Int) -> [OverlayElement] {
        overlay.elements[frame] ?? []
    }

    /// Look up a single renderer-ready slot by ad index (matches JSON key).
    public func slot(forAdIndex adIndex: String) -> AdSlot? {
        overlay.adSlots[adIndex]
    }
}
