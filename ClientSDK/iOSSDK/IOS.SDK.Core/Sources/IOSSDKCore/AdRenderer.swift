//
//  AdRenderer.swift
//  IOSSDKCore
//
//  Common ad-texture lifecycle shared by every renderer package.
//

import Foundation

/// Ad-texture lifecycle exposed by every renderer in the SDK.
public protocol AdRenderer: AnyObject {
    /// Fires on the main actor once every per-slot texture finishes
    /// uploading (failed slots fall back to a placeholder).
    var onAdTexturesReady: (() -> Void)? { get set }

    /// Kick off async download + GPU upload for every ad slot in `parser`.
    @MainActor func loadAdTextures(for parser: AdManifestParser)

    /// Drop every registered ad timeline / per-slot state.
    @MainActor func clearAdTextures()
}
