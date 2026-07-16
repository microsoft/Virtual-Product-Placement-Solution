// swift-tools-version: 5.10
//
//  IOS.SDK.Native
//
//  Native (AVFoundation-fed) Metal renderer for ad-insertion playback.
//  Bundles `Shaders.metal` and `checkboard.png` as package resources.
//  Re-exports `IOSSDKCore` so app code only needs `import IOSSDKNative`.
//
import PackageDescription
import Foundation

// `.dynamic` is required when archiving into an XCFramework (set
// BUILD_XCFRAMEWORK=1 in the env). Source consumers leave it unset so
// SPM keeps picking static linkage.
let libraryType: Product.Library.LibraryType? =
    ProcessInfo.processInfo.environment["BUILD_XCFRAMEWORK"] == "1" ? .dynamic : nil

let package = Package(
    name: "IOSSDKNative",
    platforms: [
        .iOS(.v17),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "IOSSDKNative",
            type: libraryType,
            targets: ["IOSSDKNative"]
        )
    ],
    dependencies: [
        .package(path: "../IOS.SDK.Core")
    ],
    targets: [
        .target(
            name: "IOSSDKNative",
            dependencies: [
                .product(name: "IOSSDKCore", package: "IOS.SDK.Core")
            ],
            path: "Sources/IOSSDKNative",
            resources: [
                .process("Shaders.metal"),
                .process("checkboard.png")
            ]
        )
    ]
)
