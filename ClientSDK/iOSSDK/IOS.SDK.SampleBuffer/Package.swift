// swift-tools-version: 5.10
//
//  IOS.SDK.SampleBuffer
//
//  Metal renderer targeting `AVSampleBufferDisplayLayer`. Produces a new
//  `CVPixelBuffer` (BGRA, drawn from an internal pool) per decoded video
//  frame, with ad overlays composited on top. Accepts either BGRA or NV12
//  input pixel buffers, so it slots in behind any video decoder that emits
//  CVPixelBuffers (TTVideoEngine, VideoToolbox, etc.).
//
//  Bundles `Shaders.metal` and `checkboard.png` as package resources, and
//  re-exports `IOSSDKCore` so app code only needs `import IOSSDKSampleBuffer`.
//
import PackageDescription
import Foundation

// `.dynamic` is required when archiving into an XCFramework (set
// BUILD_XCFRAMEWORK=1 in the env). Source consumers leave it unset so
// SPM keeps picking static linkage.
let libraryType: Product.Library.LibraryType? =
    ProcessInfo.processInfo.environment["BUILD_XCFRAMEWORK"] == "1" ? .dynamic : nil

let package = Package(
    name: "IOSSDKSampleBuffer",
    platforms: [
        .iOS(.v17),
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "IOSSDKSampleBuffer",
            type: libraryType,
            targets: ["IOSSDKSampleBuffer"]
        )
    ],
    dependencies: [
        .package(path: "../IOS.SDK.Core")
    ],
    targets: [
        .target(
            name: "IOSSDKSampleBuffer",
            dependencies: [
                .product(name: "IOSSDKCore", package: "IOS.SDK.Core")
            ],
            path: "Sources/IOSSDKSampleBuffer",
            resources: [
                .process("Shaders.metal"),
                .process("checkboard.png")
            ]
        )
    ]
)
