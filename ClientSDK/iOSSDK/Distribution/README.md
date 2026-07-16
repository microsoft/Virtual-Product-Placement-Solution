# Distribution

Standalone SwiftPM package that vends the SDK as **binary XCFrameworks**.
External consumers depend on this directory (and *only* this directory) —
they never see the SDK source.

## Layout

```text
Distribution/
├── Package.swift                # vends 3 products via .binaryTarget
├── Wrappers/                    # one-line source targets used to express
│   ├── IOSSDKCore/              #   the dependency graph (binary targets
│   ├── IOSSDKNative/            #   cannot declare dependencies in SPM)
│   └── IOSSDKSampleBuffer/
└── xcframeworks/                # produced by ../Scripts/build-xcframeworks.sh
    ├── IOSSDKCore.xcframework          (ios-arm64 + ios-arm64_x86_64-simulator)
    ├── IOSSDKNative.xcframework
    └── IOSSDKSampleBuffer.xcframework
```

`xcframeworks/*.xcframework` is **git-ignored** — regenerate locally with
the script.

## Products

| Product               | Backing XCFramework                | Pulls in (transitively) |
| --------------------- | ---------------------------------- | ----------------------- |
| `IOSSDKCore`          | `IOSSDKCore.xcframework`           | —                       |
| `IOSSDKNative`        | `IOSSDKNative.xcframework`         | `IOSSDKCore`            |
| `IOSSDKSampleBuffer`  | `IOSSDKSampleBuffer.xcframework`   | `IOSSDKCore`            |

Each XCFramework is built with `BUILD_LIBRARY_FOR_DISTRIBUTION=YES`, so
its `Modules/<Module>.swiftmodule/` directory contains a generated
`.swiftinterface` — that is the only thing consumers' compilers (and
Xcode's ⌘-click jump) see. SDK-internal types (`MetalRenderer`,
`AdSessionImpl`, …) are absent.

## Regenerate the XCFrameworks

```bash
./Scripts/build-xcframeworks.sh                          # all three
./Scripts/build-xcframeworks.sh IOSSDKCore               # subset
./Scripts/build-xcframeworks.sh IOSSDKNative IOSSDKSampleBuffer
```

The script archives each scheme for both `iphoneos` and
`iphonesimulator` with library evolution, injects the generated
`.swiftmodule` directory and any resource bundle into the framework,
then merges them with `xcodebuild -create-xcframework`.

See [`../Scripts/README.md`](../Scripts/README.md) for prerequisites.

## Consuming From a Host App

### From a Package.swift

```swift
// Package.swift
.package(path: "path/to/Distribution"),

// in a target's dependencies:
.product(name: "IOSSDKNative",       package: "Distribution"),
// or
.product(name: "IOSSDKSampleBuffer", package: "Distribution"),
// or just Core if you only need the manifest/session machinery:
.product(name: "IOSSDKCore",         package: "Distribution"),
```

Depending on a renderer product transitively pulls `IOSSDKCore` —
hosts only need to list the renderer they actually use.

### From an .xcodeproj

`File → Add Package Dependencies… → Add Local…` and pick the
`Distribution/` directory. In the target's **Frameworks, Libraries,
and Embedded Content**, add the product(s) you need (same options as
above).

The two reference apps in [`../Example/`](../Example/) are wired up
exactly this way — read their `project.pbxproj` for a concrete sample
of the `XCLocalSwiftPackageReference` + `XCSwiftPackageProductDependency`
entries.

### Imports

The renderer modules re-export `IOSSDKCore`, so a single import is
enough:

```swift
import IOSSDKNative       // re-exports IOSSDKCore
// or
import IOSSDKSampleBuffer // re-exports IOSSDKCore
// or
import IOSSDKCore         // for headless / Core-only tools
```

## Why the `Wrappers/` Stub Targets?

SwiftPM `.binaryTarget` cannot declare dependencies. To make
`IOSSDKNative` (binary) automatically pull `IOSSDKCore` (binary) for
the consumer, each binary is paired with a tiny **source wrapper**
target (e.g. `IOSSDKNativeKit`) that:

- declares the binary as a dependency,
- declares any sibling binaries it needs (Core),
- contains a single empty `.swift` file so SPM accepts it.

The user-facing product (`IOSSDKNative`) is then defined to vend the
**wrapper**, which transitively re-exposes the binary plus its deps.

This is invisible to consumers — they just import the module name.

## Inspecting the Public API

Each `.swiftinterface` is plain text and lives at:

```
xcframeworks/<Module>.xcframework/ios-arm64/<Module>.framework/Modules/<Module>.swiftmodule/arm64-apple-ios.swiftinterface
```

Open it directly to see the exact contract (or ⌘-click any SDK symbol
inside one of the Example apps — Xcode jumps to the same file).
