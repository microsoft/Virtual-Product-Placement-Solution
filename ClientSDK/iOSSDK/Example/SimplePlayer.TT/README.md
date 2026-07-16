# Example / SimplePlayer.TT (Binary SDK Consumer)

A copy of [`../../SimplePlayer.TT/`](../../SimplePlayer.TT/) rewired to
consume the **binary** SDK distribution at
[`../../Distribution/`](../../Distribution/) instead of the SDK source
packages. Same TTSDK pipeline (TTVideoEngine →
`AVSampleBufferDisplayLayer`), same UI — only the SDK dependency
changes.

Use this project as a reference for how an external integrator would
adopt the SDK as a vendored XCFramework alongside CocoaPods deps.

## What's Different From the Source-Tree Version

| Aspect            | `SimplePlayer.TT/`                                | `Example/SimplePlayer.TT/`                  |
| ----------------- | ------------------------------------------------- | ------------------------------------------- |
| Swift package ref | `../IOS.SDK.SampleBuffer` + `../IOS.SDK.Core`     | `../../Distribution` (one ref)              |
| Source visibility | Full — ⌘-click jumps into the SDK `.swift` file  | Interface only — ⌘-click opens `.swiftinterface` |
| CocoaPods         | Same (`TTSDKFramework`, `RangersAppLog`)          | Same                                        |
| App source        | Identical                                         | Identical                                   |

The app's own Swift files
([`SimplePlayer.TT/PlayerViewModel.swift`](SimplePlayer.TT/PlayerViewModel.swift),
[`SampleBufferDisplayView.swift`](SimplePlayer.TT/SampleBufferDisplayView.swift),
…) are **unchanged byte-for-byte**.

## Prerequisites

1. Build the XCFrameworks once, from the repo root:

   ```bash
   ./Scripts/build-xcframeworks.sh
   ```

   This populates `../../Distribution/xcframeworks/*.xcframework`.
   Re-run any time the SDK source changes.

2. CocoaPods installed (`pod --version` works). One-time install:

   ```bash
   brew install cocoapods
   # or
   sudo gem install cocoapods
   ```

3. macOS with Xcode installed (iOS 26 SDK, deployment target iOS 15.0).
4. Apple Developer signing identity for device builds (automatic
   signing with team `5L5VC24UG2` is preconfigured).

## Setup

The workspace, `Podfile.lock`, and `Pods/` are intentionally **not**
checked in for the Example copy. Generate them once:

```bash
cd Example/SimplePlayer.TT
pod install
```

That produces `SimplePlayer.TT.xcworkspace`. Always open the
**workspace**, not the `.xcodeproj`.

## Build From Xcode

```bash
open SimplePlayer.TT.xcworkspace
```

Pick scheme `SimplePlayer.TT`, choose a connected iOS device, **Product
→ Build / Run**. Xcode will resolve the local `../../Distribution`
package on first open.

## Build From Command Line

Generic device build (no install):

```bash
xcodebuild \
  -workspace SimplePlayer.TT.xcworkspace \
  -scheme SimplePlayer.TT \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates \
  build
```

Build for a specific paired device (produces an installable `.app`):

```bash
xcodebuild \
  -workspace SimplePlayer.TT.xcworkspace \
  -scheme SimplePlayer.TT \
  -configuration Debug \
  -destination 'platform=iOS,id=<YOUR_DEVICE_UDID>' \
  -allowProvisioningUpdates \
  build
```

List paired devices with:

```bash
xcrun devicectl list devices
```

## Install & Launch on Device

```bash
xcrun devicectl device install app \
  --device <YOUR_DEVICE_UDID> \
  ~/Library/Developer/Xcode/DerivedData/SimplePlayer.TT-*/Build/Products/Debug-iphoneos/SimplePlayer.TT.app

xcrun devicectl device process launch \
  --device <YOUR_DEVICE_UDID> \
  com.xiaoyxue.SimplePlayer-TT
```

## iOS Simulator Limitation

`libRangersAppLog_*.a` ships only device slices (no `arm64-simulator`).
Linking for the iOS Simulator on Apple-Silicon Macs fails with:

```
ld: building for 'iOS-simulator', but linking in object file
    (.../libRangersAppLog_CN_awesome_ios.a[arm64](...)) built for 'iOS'
```

**Build on a real device.** Workarounds (Rosetta + `EXCLUDED_ARCHS`,
or replacing the `.a` with an XCFramework) are documented in
[`../../SimplePlayer.TT/README.md`](../../SimplePlayer.TT/README.md)
but not applied here.

## Inspecting the SDK API

⌘-click any SDK symbol in
[`SimplePlayer.TT/PlayerViewModel.swift`](SimplePlayer.TT/PlayerViewModel.swift)
(e.g. `AdSessionFactory`, `RendererFactory`,
`session.allAdSlots`, `slot.startFrame`, …). Xcode opens the matching
`.swiftinterface` from inside the XCFramework — that is the complete
public contract.

Alternative: open
`../../Distribution/xcframeworks/IOSSDKSampleBuffer.xcframework/ios-arm64/IOSSDKSampleBuffer.framework/Modules/IOSSDKSampleBuffer.swiftmodule/arm64-apple-ios.swiftinterface`
in any editor.

## Troubleshooting

- **"Missing package product 'IOSSDKSampleBuffer'"** — the XCFrameworks
  haven't been built yet. Run `./Scripts/build-xcframeworks.sh` from
  the repo root.
- **"Build fails with missing Pods files"** — re-run `pod install`
  inside `Example/SimplePlayer.TT/`.
- **Stale interfaces after SDK changes** — Xcode caches resolved
  binary packages. After re-running the build script, do
  `File → Packages → Reset Package Caches` and build again.
- **Signing / provisioning errors on device builds** — open the
  workspace in Xcode and configure Team / Bundle Signing for the
  `SimplePlayer.TT` target, or pass `-allowProvisioningUpdates` to
  `xcodebuild`.
- **Runtime TTSDK init / license issues** — verify
  [`SimplePlayer.TT/TTSDKConfig.json`](SimplePlayer.TT/TTSDKConfig.json)
  contains valid `appID` / `licenseName` / `bundleID`, and that
  `SimplePlayer-TT-License.lic` matches.
- **JSON resources missing** — every `*.json` resource in
  `SimplePlayer.TT/` should be a real file (the originals in the
  source-tree app are symlinks into `../../../Asset/`). If you re-copied
  the directory, use `rsync -aL` to dereference symlinks.
