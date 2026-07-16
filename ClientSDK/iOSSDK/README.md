# IOS.SimplePlayer

Two iOS video-player sample apps that share the same ad-insertion
pipeline — manifest fetch, per-frame overlay math, impression tracking,
Metal renderer — but use different decoder back-ends (AVFoundation vs.
TTSDK).

The shared pipeline lives in **three local Swift Package Manager
packages**; the apps are thin shells that wire a decoder to a renderer
via the `AdSession` orchestrator.

## Repository Layout

```text
IOS.SimplePlayer/
├── IOS.SDK.Core/           # SPM — manifest model, AdSession orchestrator,
│                           #       HTTP service, texture loader, tracker
├── IOS.SDK.Native/         # SPM — Metal renderer for AVPlayer-fed frames
│                           #       (re-exports IOSSDKCore)
├── IOS.SDK.SampleBuffer/   # SPM — Metal renderer targeting
│                           #       AVSampleBufferDisplayLayer (BGRA + NV12)
│                           #       (re-exports IOSSDKCore)
├── SimplePlayer.Native/    # iOS app — AVPlayer + IOSSDKNative (source SPM)
├── SimplePlayer.TT/        # iOS app — TTVideoEngine + IOSSDKSampleBuffer (source SPM)
├── Distribution/           # Binary SPM wrapper — vends XCFrameworks via
│                           #       .binaryTarget; what external consumers depend on
├── Scripts/                # build-xcframeworks.sh — produces the XCFrameworks
│                           #       under Distribution/xcframeworks/
├── Example/                # Reference apps that consume the binary distribution
│                           #       (mirror of SimplePlayer.Native / .TT, no SDK source)
└── Asset/                  # Sample manifests + service configs
```

## Packages

### [IOS.SDK.Core](IOS.SDK.Core/) — `IOSSDKCore`

Platform-agnostic, no Metal dependency. Public surface:

- **`AdSession`** (`protocol` + `AdSessionFactory.make()`) — engine-agnostic
  orchestrator that owns manifest fetch, per-frame frame-index math, the
  ads-ready playback gate, and impression-tracker bookkeeping. The
  recommended entry point.
- **`AdRenderer`** (`protocol`) — common ad-texture lifecycle every
  renderer package implements (`loadAdTextures`, `clearAdTextures`,
  `onAdTexturesReady`).
- `AdManifest` / `AdManifestParser` / `AdSlot` / `OverlayElement` —
  Codable model + per-frame lookup.
- `AllProcessService` — fetches the manifest over an ephemeral
  `URLSession` (cache bypass forced).
- `UploadImpressionService` + `AdImpressionTracker` — POSTs viewable-
  impression events.
- `AdTextureLoader` — per-slot image download + GIF/APNG/WebP timeline +
  mip-mapped GPU upload (no on-disk or in-memory HTTP cache).
- `AdServiceConfig` + `DefaultHosts` — credentials + API host overrides.

### [IOS.SDK.Native](IOS.SDK.Native/) — `IOSSDKNative`

Metal renderer fed by `AVPlayerItemVideoOutput`. Re-exports
`IOSSDKCore`, so hosts only `import IOSSDKNative`.

- **`Renderer`** (`protocol` + `RendererFactory.make()`) — extends
  `AdRenderer` with `device` and `renderToDrawable(...in: MTKView)`.
  Concrete `MetalRenderer` is SDK-internal.
- Bundles `Shaders.metal` and `checkboard.png` as package resources.

### [IOS.SDK.SampleBuffer](IOS.SDK.SampleBuffer/) — `IOSSDKSampleBuffer`

Metal renderer for any decoder that hands you a `CVPixelBuffer` (TTSDK,
VideoToolbox, …). Re-exports `IOSSDKCore`.

- **`Renderer`** (`protocol` + `RendererFactory.make()`) — extends
  `AdRenderer` with `renderToPixelBuffer(...) -> CVPixelBuffer?`.
  Handles **both BGRA and NV12** (BT.709 video-range YUV → RGB) and
  produces a pooled BGRA `CVPixelBuffer` the host wraps in a
  `CMSampleBuffer` and enqueues into `AVSampleBufferDisplayLayer`.
- Bundles `Shaders.metal` and `checkboard.png` (unused fallback;
  missing-texture slots are skipped to avoid placeholder flash).

Each package is consumed via a local path reference:

```swift
.package(path: "../IOS.SDK.Core")
```

## Using the SDKs

`AdSession` (Core) drives the manifest + frame math; one of the two
renderer packages drives the GPU. Both renderer packages re-export
`IOSSDKCore`, so a host app only imports the renderer it needs.

### End-to-end example (AVPlayer + `IOSSDKNative`)

```swift
import IOSSDKNative      // re-exports IOSSDKCore
import AVFoundation
import MetalKit

// 1) Build the session + renderer.
let session: any AdSession = AdSessionFactory.make()
let renderer: (any Renderer)? = RendererFactory.make()   // nil if no Metal

// 2) Wire them together.
session.serviceConfig = AdServiceConfig.loadFromBundle()   // or set fields manually
session.onManifestChanged = { [weak renderer] parser in
    if let parser { renderer?.loadAdTextures(for: parser) }
    else          { renderer?.clearAdTextures() }
}
renderer?.onAdTexturesReady = { [weak session] in
    session?.markAdsReady()        // opens the playback gate
}

// 3) Load the manifest (kicks off ad-image downloads via the wire above).
Task { @MainActor in await session.loadManifest() }

// 4) On every decoded frame from AVPlayerItemVideoOutput:
//    a) Let the session update frame indices + dispatch the tracker.
//    b) Pass session-owned overlays + videoSize to the renderer.
session.nominalFPS = Float(asset.tracks(withMediaType: .video).first?.nominalFrameRate ?? 0)
session.observe(pixelBuffer: pb, pts: pts, playbackRate: rate)

renderer?.renderToDrawable(
    pixelBuffer: pb,
    overlays: session.currentFrameOverlays,
    videoSize: session.videoSize,
    currentVideoPTS: CMTimeGetSeconds(pts),
    in: mtkView
)

// 5) When the user opens a different video:
session.reset()                    // also fires onManifestChanged(nil)
```

That's the entire happy path. The view layer can drive a loading
spinner off `session.isAdsReady`, and an "ad jump strip" off
`session.allAdSlots` + `session.videoTime(forManifestFrame:)`.

### CVPixelBuffer pipeline (`IOSSDKSampleBuffer`)

Same wiring; the only difference is the per-frame render call returns
a `CVPixelBuffer` that you wrap and enqueue yourself:

```swift
import IOSSDKSampleBuffer

let renderer: (any Renderer)? = RendererFactory.make()

// In your decoder's frame callback (e.g. TTSDK's ttvFrameProcess):
session.observe(pixelBuffer: input, pts: pts, playbackRate: rate)

guard let output = renderer?.renderToPixelBuffer(
    input,
    overlays: session.currentFrameOverlays,
    videoSize: session.videoSize,
    currentVideoPTS: CMTimeGetSeconds(pts),
    displayPixelSize: displayLayerPixelSize,           // bounds × displayScale
    useDeviceResolutionForRasterization: false         // true = device DPI
) else { return }

// Wrap `output` as CMSampleBuffer (keep the original PTS) and enqueue
// into AVSampleBufferDisplayLayer. See `SampleBufferDisplayView`.
```

### Core-only (no renderer)

Headless tools (analytics, integration tests) can use `IOSSDKCore`
directly. `AdSession` still applies — just don't wire a renderer:

```swift
import IOSSDKCore

let session: any AdSession = AdSessionFactory.make()
session.localManifestResource = "32"     // Asset/32.json copied to bundle
await session.loadManifest()             // skips the network

// Drive frame indices manually from your synthetic timeline:
session.nominalFPS = 25
session.observe(pixelBuffer: pb, pts: CMTime(seconds: 1.2, preferredTimescale: 600),
                playbackRate: 1.0)
print(session.manifestFrameIndex, session.currentFrameOverlays)
```

### Notes

- Overlays are in **source video pixel space** (top-left origin);
  `videoSize` (also session-owned, captured on first frame) is used
  to normalize them to clip space.
- `currentVideoPTS` is the seconds-based PTS of the just-decoded frame.
  Wrong values desync GIF animation, not the video itself.
- Both renderers **skip slots whose texture isn't ready yet** — no
  checkerboard flash. The view layer should show a spinner while
  `session.isAdsReady == false`.

## Apps

### [SimplePlayer.Native](SimplePlayer.Native/)

SwiftUI + `AVFoundation` + `IOSSDKNative`. **No third-party
dependencies** — open `SimplePlayer.Native.xcodeproj` directly.

- `CVPixelBuffer`s pulled from `AVPlayerItemVideoOutput`, rendered
  through an `MTKView` drawable.
- Two entry points:
  - **Open Video** — `UIDocumentPickerViewController` picks a local
    file, then a list from [`LocalConfigs.json`](Asset/LocalConfigs.json)
    chooses a bundled mock manifest (no remote fetch).
  - **Review Videos** — lists [`ServiceConfigs.json`](Asset/ServiceConfigs.json)
    entries and plays each entry's remote `videoUrl` using its
    `pubVideoId` + `secretKey` for the manifest fetch.

### [SimplePlayer.TT](SimplePlayer.TT/)

SwiftUI + [TTSDK (TTVideoEngine)](https://www.volcengine.com/) +
`IOSSDKSampleBuffer`. CocoaPods (`TTSDKFramework`, `RangersAppLog`) —
open `SimplePlayer.TT.xcworkspace` after `pod install`.

- TTSDK credentials loaded from
  [`TTSDKConfig.json`](SimplePlayer.TT/SimplePlayer.TT/TTSDKConfig.json)
  + `SimplePlayer-TT-License.lic` at launch.
- Frames arrive via `ttvFrameProcess` (`CVPixelBuffer` + Int64 ms ts),
  composited into a pooled BGRA buffer, wrapped as `CMSampleBuffer`,
  and enqueued into an `AVSampleBufferDisplayLayer`
  ([`SampleBufferDisplayView`](SimplePlayer.TT/SimplePlayer.TT/SampleBufferDisplayView.swift)).
- Same two entry points as Native.

See [SimplePlayer.TT/README.md](SimplePlayer.TT/README.md) for
CocoaPods setup, device build, and simulator linker limitations.

## Binary Distribution

For external consumers, the SDK ships as **XCFrameworks** wrapped by a
standalone SwiftPM package at [`Distribution/`](Distribution/). Source
is not exposed — consumers see only `.swiftinterface` files generated
by `BUILD_LIBRARY_FOR_DISTRIBUTION=YES`, so `internal` types
(`MetalRenderer`, `AdSessionImpl`, …) stay hidden.

```text
Distribution/
├── Package.swift                 # vends IOSSDKCore / IOSSDKNative / IOSSDKSampleBuffer
├── Wrappers/                     # tiny source targets that express dep graph
└── xcframeworks/                 # produced by Scripts/build-xcframeworks.sh
    ├── IOSSDKCore.xcframework         (ios-arm64 + ios-arm64_x86_64-simulator)
    ├── IOSSDKNative.xcframework
    └── IOSSDKSampleBuffer.xcframework
```

Regenerate the XCFrameworks any time the SDK source changes:

```bash
./Scripts/build-xcframeworks.sh                       # all three
./Scripts/build-xcframeworks.sh IOSSDKCore IOSSDKNative   # subset
```

Downstream apps depend on it like any other local SwiftPM package and
import the modules normally:

```swift
// in their Package.swift / .xcodeproj SPM ref:
.package(path: "path/to/Distribution")
.product(name: "IOSSDKNative", package: "Distribution")   // pulls Core transitively
```

See [`Distribution/README.md`](Distribution/README.md) and
[`Scripts/README.md`](Scripts/README.md) for details.

## Integrate Into a New App From Scratch

If you're starting fresh rather than copying one of the reference apps
in [`Example/`](Example/), the full integration is five steps.

### 1. Generate the XCFrameworks (once)

From this repo:

```bash
./Scripts/build-xcframeworks.sh
```

Produces `Distribution/xcframeworks/IOSSDK{Core,Native,SampleBuffer}.xcframework`.
Re-run any time the SDK source changes.

### 2. Create the Xcode project

In Xcode: `File → New → Project… → iOS → App`. Pick SwiftUI, deployment
target **iOS 15.0** or newer.

### 3. Add the `Distribution` SwiftPM package

In Xcode: `File → Add Package Dependencies… → Add Local…` and select
the [`Distribution/`](Distribution/) directory (either this repo's copy
or wherever you've vendored it). You'll see three products:

| Product               | When to pick it                                          |
| --------------------- | -------------------------------------------------------- |
| `IOSSDKNative`        | Decoding with `AVPlayer` + rendering into an `MTKView`   |
| `IOSSDKSampleBuffer`  | Decoding with TTSDK / VideoToolbox / any `CVPixelBuffer` source rendered through `AVSampleBufferDisplayLayer` |
| `IOSSDKCore`          | Headless tools, tests, analytics — no GPU render needed  |

Add the **single** renderer product you need to your app target's
**Frameworks, Libraries, and Embedded Content** (or to a target in
your own `Package.swift`). `IOSSDKCore` is pulled in transitively —
you don't need to add it explicitly.

If you're using your own `Package.swift` instead of an `.xcodeproj`:

```swift
.package(path: "path/to/Distribution"),
// in your target:
.product(name: "IOSSDKNative", package: "Distribution"),
```

### 4. Minimal wiring

A single `import` exposes both `AdSession` (Core) and `Renderer`
(renderer package):

```swift
import IOSSDKNative   // re-exports IOSSDKCore
import AVFoundation
import MetalKit

@MainActor
final class MyPlayerVM {
    let session: any AdSession = AdSessionFactory.make()
    let renderer: (any Renderer)? = RendererFactory.make()  // nil if no Metal

    init() {
        session.serviceConfig = AdServiceConfig.loadFromBundle()  // or set fields manually
        session.onManifestChanged = { [weak renderer] parser in
            if let parser { renderer?.loadAdTextures(for: parser) }
            else          { renderer?.clearAdTextures() }
        }
        renderer?.onAdTexturesReady = { [weak session] in
            session?.markAdsReady()                               // opens the playback gate
        }
        Task { await session.loadManifest() }
    }

    func onFrame(_ pb: CVPixelBuffer, pts: CMTime, in view: MTKView) {
        session.observe(pixelBuffer: pb, pts: pts, playbackRate: 1.0)
        renderer?.renderToDrawable(
            pixelBuffer: pb,
            overlays: session.currentFrameOverlays,
            videoSize: session.videoSize,
            currentVideoPTS: CMTimeGetSeconds(pts),
            in: view
        )
    }
}
```

Swap `IOSSDKNative` → `IOSSDKSampleBuffer` and
`renderToDrawable(in: MTKView)` → `renderToPixelBuffer(...) -> CVPixelBuffer?`
for the TTSDK / `AVSampleBufferDisplayLayer` flow — see the
[Using the SDKs](#using-the-sdks) section above for the full snippet.

### 5. Re-sync after SDK updates

Whenever you re-run `./Scripts/build-xcframeworks.sh`, force Xcode to
pick up the new XCFrameworks:

`File → Packages → Reset Package Caches`, then build again.

### Where to look next

- **Inspect the public API** — ⌘-click any SDK symbol in your code;
  Xcode opens the corresponding `.swiftinterface` (the published
  contract). Or open
  `Distribution/xcframeworks/IOSSDKCore.xcframework/ios-arm64/IOSSDKCore.framework/Modules/IOSSDKCore.swiftmodule/arm64-apple-ios.swiftinterface`
  directly.
- **Fully wired SwiftUI examples** — [`Example/SimplePlayer.Native/`](Example/SimplePlayer.Native/)
  (`AVPlayer` + `MTKView`) and
  [`Example/SimplePlayer.TT/`](Example/SimplePlayer.TT/) (TTSDK +
  `AVSampleBufferDisplayLayer`).

## Examples (Binary Consumers)

[`Example/`](Example/) holds copies of both apps wired to consume the
binary `Distribution/` package instead of the SDK source packages.
Use them as a reference for how an external integrator would adopt the
SDK.

```text
Example/
├── SimplePlayer.Native/    # AVPlayer demo via binary IOSSDKNative
└── SimplePlayer.TT/        # TTSDK demo via binary IOSSDKSampleBuffer (CocoaPods)
```

Prerequisite: run [`./Scripts/build-xcframeworks.sh`](Scripts/build-xcframeworks.sh)
at least once so `Distribution/xcframeworks/*.xcframework` exists. Then:

```bash
# Native — open the .xcodeproj directly, no extra setup
open Example/SimplePlayer.Native/SimplePlayer.Native.xcodeproj

# TT — pod install once, then open the .xcworkspace
cd Example/SimplePlayer.TT && pod install
open SimplePlayer.TT.xcworkspace
```

See [`Example/README.md`](Example/README.md) for the full walkthrough.

## Shared Feature Set

Both apps share:

- **Manifest source per entry point** — Open Video uses a bundled
  mock JSON; Review Videos fetches from the ad backend at runtime.
- **Loading spinner** on the video surface while `session.isAdsReady`
  is `false`, so users never see a half-rendered first frame.
- **Per-frame stats overlay** (top-right): timestamp, display frame
  index, manifest frame index, frame offset, PTS, current / nominal FPS.
- **Frame indexing parity with H5Player**:
  `manifestFrameIndex = round((PTS − effectiveFrameZeroPts) × fps)`,
  with `enableStartPtsIgnoreEditList = false` by default (matches
  H5Player — does **not** subtract `timeOffset`).
- **Perspective-correct ad overlays** rendered as 4-vertex quads in
  homogeneous clip space (homography ported from `VideoOverlay.ts`).
- **Ad jump strip** — one capsule per ad slot under the progress bar.
  TT adds a half-frame nudge to compensate for
  `TTVideoEngineSeekModeAccurateAny`'s floor semantics.
- **Custom fragment shaders** for both BGRA and NV12 (BT.709 video
  range YUV → RGB).
- **No caching of manifest or ad images** — manifest fetch uses
  `.reloadIgnoringLocalAndRemoteCacheData`; image session is
  `.ephemeral` with `urlCache = nil` + the same cache policy.

## Requirements

- macOS with a recent Xcode (projects use the iOS 26 SDK; deployment
  target iOS 15.0)
- iOS device or simulator
- CocoaPods (only for `SimplePlayer.TT`)

## Quick Build

`SimplePlayer.Native` (any destination, no signing needed for
simulator):

```bash
xcodebuild -project SimplePlayer.Native/SimplePlayer.Native.xcodeproj \
  -scheme SimplePlayer.Native \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO
```

`SimplePlayer.TT` — device build only (see project README for the
simulator linker limitation):

```bash
cd SimplePlayer.TT
pod install   # one-time
xcodebuild -workspace SimplePlayer.TT.xcworkspace \
  -scheme SimplePlayer.TT \
  -destination 'generic/platform=iOS' \
  -configuration Debug build CODE_SIGNING_ALLOWED=NO
```

Each SDK package builds standalone:

```bash
(cd IOS.SDK.Core         && swift build)
(cd IOS.SDK.Native       && swift build)
(cd IOS.SDK.SampleBuffer && swift build)
```
