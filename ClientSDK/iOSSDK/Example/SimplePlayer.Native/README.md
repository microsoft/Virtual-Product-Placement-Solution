# Example / SimplePlayer.Native (Binary SDK Consumer)

A copy of [`../../SimplePlayer.Native/`](../../SimplePlayer.Native/)
rewired to consume the **binary** SDK distribution at
[`../../Distribution/`](../../Distribution/) instead of the SDK source
packages.

Use this project as a reference for how an external integrator would
adopt the SDK as a vendored XCFramework.

## What's Different From the Source-Tree Version

| Aspect            | `SimplePlayer.Native/`                       | `Example/SimplePlayer.Native/`               |
| ----------------- | -------------------------------------------- | -------------------------------------------- |
| Swift package ref | `../IOS.SDK.Native` + `../IOS.SDK.Core`      | `../../Distribution` (one ref)               |
| Source visibility | Full — ⌘-click jumps into the `.swift` file | Interface only — ⌘-click opens `.swiftinterface` |
| Symbols available | All `public` + `internal`                    | Only what's in `.swiftinterface` (`public`)  |
| App source        | Identical                                    | Identical                                    |

The app's own Swift files
([`SimplePlayer.Native/PlayerViewModel.swift`](SimplePlayer.Native/PlayerViewModel.swift),
[`PlayerView.swift`](SimplePlayer.Native/PlayerView.swift), …) are
**unchanged byte-for-byte**. The only thing the example proves is
that the public surface published by the binary distribution is
sufficient to build the full app — including the ad-jump strip
(`session.allAdSlots`, `AdSlot.startFrame`, etc.).

## Prerequisites

1. Build the XCFrameworks once, from the repo root:

   ```bash
   ./Scripts/build-xcframeworks.sh
   ```

   This populates `../../Distribution/xcframeworks/*.xcframework`.
   Re-run any time the SDK source changes.

2. macOS with Xcode installed (project targets the iOS 26 SDK,
   deployment target iOS 15.0). No CocoaPods, no extra tooling.

## Build From Xcode

Open the project directly:

```bash
open SimplePlayer.Native.xcodeproj
```

Pick any simulator or device destination and **Product → Build /
Run**. Xcode will resolve the local `../../Distribution` package
on first open (status bar: "Resolve Package Dependencies").

## Build From Command Line

```bash
xcodebuild \
  -project SimplePlayer.Native.xcodeproj \
  -scheme SimplePlayer.Native \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO
```

For a real device, swap to `-destination 'generic/platform=iOS'` and
drop `CODE_SIGNING_ALLOWED=NO` (or use `-allowProvisioningUpdates`).

## Inspecting the SDK API

From any source file in the project, ⌘-click any SDK symbol
(`AdSessionFactory`, `RendererFactory`, `AdSlot`, `session.allAdSlots`,
…). Xcode will open the corresponding `.swiftinterface` from inside
the XCFramework — that is the complete public contract. Internal types
(`MetalRenderer`, `AdSessionImpl`, …) are **not** visible.

Alternative: open
`../../Distribution/xcframeworks/IOSSDKCore.xcframework/ios-arm64/IOSSDKCore.framework/Modules/IOSSDKCore.swiftmodule/arm64-apple-ios.swiftinterface`
in any editor.

## Troubleshooting

- **"Missing package product 'IOSSDKNative'"** — the XCFrameworks
  haven't been built yet. Run `./Scripts/build-xcframeworks.sh` from
  the repo root.
- **Stale interfaces after SDK changes** — Xcode caches resolved
  binary packages. After re-running the script, do
  `File → Packages → Reset Package Caches`, then build again.
- **JSON / asset "no such file" errors** — every `*.json` resource in
  `SimplePlayer.Native/` should be a real file (the originals in the
  source-tree app are symlinks into `../../Asset/`). If you re-copied
  the directory, make sure to use `rsync -aL` to dereference symlinks.
