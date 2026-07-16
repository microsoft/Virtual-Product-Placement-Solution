# Scripts

Build automation for binary SDK distribution.

## `build-xcframeworks.sh`

Builds `IOSSDKCore` / `IOSSDKNative` / `IOSSDKSampleBuffer` as
**XCFrameworks** (iOS device + iOS simulator slices merged), then
drops them into [`../Distribution/xcframeworks/`](../Distribution/xcframeworks/)
so the binary SwiftPM wrapper in [`../Distribution/`](../Distribution/)
can pick them up via `.binaryTarget`.

### Usage

Run from the repo root (the script `cd`s there itself, but the relative
output path assumes you don't move it):

```bash
./Scripts/build-xcframeworks.sh                                # all three
./Scripts/build-xcframeworks.sh IOSSDKCore                     # subset
./Scripts/build-xcframeworks.sh IOSSDKNative IOSSDKSampleBuffer
```

### What it does (per scheme)

1. `xcodebuild archive` for `generic/platform=iOS` with
   `BUILD_LIBRARY_FOR_DISTRIBUTION=YES` and `BUILD_XCFRAMEWORK=1`
   (the env var conditionally switches each `Package.swift`'s library
   product to `.dynamic`).
2. `xcodebuild archive` for `generic/platform=iOS Simulator` with the
   same flags.
3. Locates `<Scheme>.framework` inside each archive (SPM puts it at an
   arbitrary subpath — `find -L` is used).
4. Injects the generated `<Scheme>.swiftmodule/` (with
   `arm64-apple-ios{,-simulator}.swiftinterface` + companions) into
   the framework's `Modules/` directory.
5. Injects any resource bundle (`<Pkg>_<Scheme>.bundle` for `Native` /
   `SampleBuffer`) next to the framework binary, dereferencing symlinks.
6. `xcodebuild -create-xcframework` merges device + simulator slices
   into the final `.xcframework`.

Final outputs land at `Distribution/xcframeworks/<Scheme>.xcframework/`
with structure:

```
<Scheme>.xcframework/
├── Info.plist
├── ios-arm64/
│   └── <Scheme>.framework/
│       ├── <Scheme>                       (Mach-O binary)
│       ├── Info.plist
│       ├── Modules/<Scheme>.swiftmodule/
│       │   ├── arm64-apple-ios.swiftinterface
│       │   ├── arm64-apple-ios.private.swiftinterface
│       │   ├── arm64-apple-ios.swiftdoc
│       │   └── arm64-apple-ios.abi.json
│       └── <Scheme>_<Scheme>.bundle/      (Native / SampleBuffer only)
└── ios-arm64_x86_64-simulator/
    └── <Scheme>.framework/                 (same layout, sim slices)
```

The `arm64-apple-ios.swiftinterface` file is the public API contract
that downstream Swift compilers see (and what Xcode's ⌘-click opens).

### Prerequisites

- macOS with Xcode installed (the script uses `xcodebuild` and
  `xcrun`).
- A working iOS simulator runtime (for the simulator archive step).
- `xcbeautify` is optional — the script falls back to raw `xcodebuild`
  output if it isn't installed.

### Scratch / output paths

- `.build-xcf/` (repo root, git-ignored) — temporary archives + derived
  data. Safe to delete between runs.
- `Distribution/xcframeworks/` — final products (also git-ignored
  except for the `.gitignore` placeholder).

### When to re-run

- Any time the SDK source under `IOS.SDK.Core/`, `IOS.SDK.Native/`, or
  `IOS.SDK.SampleBuffer/` changes (including resources like
  `Shaders.metal` or `checkboard.png`).
- After bumping the Swift / Xcode toolchain — `.swiftinterface` is
  version-tied.
- After changing `BUILD_LIBRARY_FOR_DISTRIBUTION` settings or product
  visibility (e.g. promoting an `internal` symbol to `public`).

The Example apps in [`../Example/`](../Example/) will pick up the new
XCFrameworks on their next build.
