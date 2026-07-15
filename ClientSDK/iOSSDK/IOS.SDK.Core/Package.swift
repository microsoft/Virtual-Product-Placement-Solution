// swift-tools-version: 5.10
//
//  IOS.SDK.Core
//
//  Platform-agnostic core for ad-insertion playback. Contains the manifest
//  data model + parser, the HTTP service layer that talks to the ad backend,
//  the per-slot texture loader, and the impression tracker.
//
//  Consumed by the renderer SDKs (IOS.SDK.Native, IOS.SDK.SampleBuffer) and
//  indirectly by their host apps.
//
import PackageDescription
import Foundation

// `.dynamic` is required when archiving into an XCFramework (set
// BUILD_XCFRAMEWORK=1 in the env). Source consumers leave it unset so
// SPM keeps picking static linkage.
let libraryType: Product.Library.LibraryType? =
    ProcessInfo.processInfo.environment["BUILD_XCFRAMEWORK"] == "1" ? .dynamic : nil

let package = Package(
    name: "IOSSDKCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "IOSSDKCore",
            type: libraryType,
            targets: ["IOSSDKCore"]
        )
    ],
    targets: [
        .target(
            name: "IOSSDKCore",
            path: "Sources/IOSSDKCore"
        )
    ]
)
