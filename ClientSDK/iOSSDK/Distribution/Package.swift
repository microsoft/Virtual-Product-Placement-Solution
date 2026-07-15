// swift-tools-version: 5.10
//
//  Distribution
//
//  Binary-only SPM package that re-publishes IOSSDKCore / IOSSDKNative /
//  IOSSDKSampleBuffer as XCFrameworks. Consumers add this package and only
//  see public Swift interface — no source files.
//
//  Build the XCFrameworks first:
//      ./Scripts/build-xcframeworks.sh
//  (outputs into Distribution/xcframeworks/)
//
//  To consume locally:
//      .package(path: "../IOS.SimplePlayer/Distribution")
//
//  To consume from git:
//      .package(url: "<your-distribution-repo>.git", from: "1.0.0")
//
//  For remote zips, swap each .binaryTarget(path:) for
//  .binaryTarget(url:checksum:) — see commented examples below.
//
import PackageDescription

let package = Package(
    name: "IOSSDK",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        // Wrapper-fronted products. Consumers only depend on the
        // renderer product they need; SPM auto-pulls IOSSDKCore.
        .library(name: "IOSSDKCore",         targets: ["IOSSDKCoreKit"]),
        .library(name: "IOSSDKNative",       targets: ["IOSSDKNativeKit"]),
        .library(name: "IOSSDKSampleBuffer", targets: ["IOSSDKSampleBufferKit"])
    ],
    targets: [
        // Binary XCFrameworks (no `dependencies:` allowed on .binaryTarget).
        .binaryTarget(
            name: "IOSSDKCoreBinary",
            path: "xcframeworks/IOSSDKCore.xcframework"
        ),
        .binaryTarget(
            name: "IOSSDKNativeBinary",
            path: "xcframeworks/IOSSDKNative.xcframework"
        ),
        .binaryTarget(
            name: "IOSSDKSampleBufferBinary",
            path: "xcframeworks/IOSSDKSampleBuffer.xcframework"
        ),

        // Empty source targets that express the dep graph between the
        // binary targets. The actual module names consumers `import`
        // (IOSSDKCore, IOSSDKNative, IOSSDKSampleBuffer) come from the
        // binary frameworks themselves; these wrappers add no symbols.
        .target(
            name: "IOSSDKCoreKit",
            dependencies: ["IOSSDKCoreBinary"],
            path: "Wrappers/IOSSDKCore"
        ),
        .target(
            name: "IOSSDKNativeKit",
            dependencies: ["IOSSDKNativeBinary", "IOSSDKCoreBinary"],
            path: "Wrappers/IOSSDKNative"
        ),
        .target(
            name: "IOSSDKSampleBufferKit",
            dependencies: ["IOSSDKSampleBufferBinary", "IOSSDKCoreBinary"],
            path: "Wrappers/IOSSDKSampleBuffer"
        )

        // Remote alternative (compute checksum with
        //   `swift package compute-checksum IOSSDKCore.xcframework.zip`):
        //
        // .binaryTarget(
        //     name: "IOSSDKCoreBinary",
        //     url: "https://your-cdn.example/IOSSDKCore-1.0.0.xcframework.zip",
        //     checksum: "<sha256-from-compute-checksum>"
        // )
    ]
)
