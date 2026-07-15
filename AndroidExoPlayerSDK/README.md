# Virtual Ads Android SDK (ExoPlayer / Media3)

Binary distribution of the **Virtual Ads SDK** for Android apps that use
AndroidX Media3 ExoPlayer. The SDK overlays server-driven virtual ads onto
video frames via a Media3 `VideoEffect` and reports exposure back to the
Virtual-Product-Placement service.

## Table of contents

- [1. What it does](#1-what-it-does)
- [2. At a glance](#2-at-a-glance)
- [3. Requirements](#3-requirements)
- [4. Install the AAR](#4-install-the-aar)
- [5. Transitive dependencies you must declare](#5-transitive-dependencies-you-must-declare)
- [6. Manifest & ProGuard](#6-manifest--proguard)
- [7. Public API reference](#7-public-api-reference)
- [8. Integration patterns](#8-integration-patterns)
- [9. PTS alignment — the two flags that decide everything](#9-pts-alignment--the-two-flags-that-decide-everything)
- [10. Exposure logging & lifecycle](#10-exposure-logging--lifecycle)
- [11. Environment / backend selection](#11-environment--backend-selection)
- [12. End-to-end verification checklist](#12-end-to-end-verification-checklist)
- [13. Troubleshooting](#13-troubleshooting)
- [14. Build-toolchain constraints](#14-build-toolchain-constraints)
- [15. FAQ](#15-faq)
- [16. Support](#16-support)

---

## 1. What it does

The SDK fetches per-video overlay data from a Microsoft-hosted backend and
composites *virtual ads* — GIF-animated product placements — onto the video
frames rendered by your existing ExoPlayer instance. It:

1. `POST /api/Preference/pubVideoId/{id}/delivery` → returns an
   `OverlayData` payload (per-frame element boxes, ad slots, fps, resolution,
   `deliveryId`).
2. Installs a Media3 [`VideoEffect`](https://developer.android.com/reference/androidx/media3/common/Effect)
   into your player. The effect runs on the GL render thread and, for each
   emitted frame, looks up the matching overlay, decodes the GIF frame, and
   draws it into the video texture.
3. Counts exposed frames per ad slot (scaled by playback speed) and posts
   `POST /api/AdLog/AdProduct/{adProductId}/Delivery/{deliveryId}/Impression`
   for each slot when the slot ends or the effect is released.

No retry/persistence layer — failures are logged and dropped (matches the
H5 player contract).

## 2. At a glance

| Item | Value |
|---|---|
| Artifact             | [`libs/varender-sdk-release.aar`](libs/varender-sdk-release.aar) (~136 KB) |
| Version              | 1.0.0 |
| Base package         | `com.microsoft.varender` |
| SDK entry class      | `com.microsoft.varender.sdk.VirtualAdsSDK` |
| Effect class         | `com.microsoft.varender.effect.VirtualAdsEffect` (Media3 `VideoEffect`) |
| minSdk               | 24 (Android 7.0) |
| compileSdk           | 34 |
| Media3 target        | 1.4.1 |
| Language             | Kotlin 1.8.22 (Java-callable) |
| License              | MIT (see repo root [LICENSE](../LICENSE)) |

## 3. Requirements

- **Android Gradle Plugin 7.1.2 or newer** (older AGPs may reject the AAR's
  metadata).
- **JDK 17 for the build** — JDK 21 triggers a D8 NullPointerException on
  the SDK's Kotlin metadata. See [§14](#14-build-toolchain-constraints).
- **Media3-based player**. Legacy `com.google.android.exoplayer2` is **not**
  supported — the effect implements `androidx.media3.common.Effect`.
- **Internet permission** at runtime.
- A **secret key** and **publisher video ID** issued to you by the
  Virtual-Product-Placement service.

## 4. Install the AAR

Copy `libs/varender-sdk-release.aar` from this repo into your app module's
`libs/` folder, e.g. `app/libs/varender-sdk-release.aar`. Then in
`app/build.gradle`:

```groovy
android {
    compileSdk 34
    defaultConfig { minSdk 24 }

    // Required if consumers still target Java 8 bytecode.
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
    kotlinOptions { jvmTarget = "1.8" }   // only if you use Kotlin

    // Silence Media3's @UnstableApi lint (VirtualAdsSDK / VirtualAdsEffect propagate it).
    lintOptions { abortOnError false }
}

repositories {
    google()
    mavenCentral()
    flatDir { dirs 'libs' }   // lets Gradle resolve the AAR by name if desired
}

dependencies {
    implementation files('libs/varender-sdk-release.aar')
    // ...transitive deps — see next section
}
```

> ⚠️ **AARs do not carry POMs**, so the SDK's own dependencies are **not**
> pulled in automatically. If you skip §5 you will get `NoClassDefFoundError`
> at runtime — usually the first time the effect touches its GIF decoder or
> HTTP client.

## 5. Transitive dependencies you must declare

Copy this block verbatim into your `app/build.gradle` `dependencies { }`.
Versions are the ones the AAR was built against; deviating risks ABI
mismatches (`NoSuchMethodError`).

```groovy
// AndroidX Media3 — the effect implements androidx.media3.common.Effect
def media3 = '1.4.1'
implementation "androidx.media3:media3-exoplayer:$media3"
implementation "androidx.media3:media3-effect:$media3"
implementation "androidx.media3:media3-common:$media3"
implementation "androidx.media3:media3-exoplayer-hls:$media3"   // only if you play HLS

// HTTP + JSON (used by AllProcessService / UploadImpressionService)
implementation 'com.squareup.okhttp3:okhttp:4.12.0'
implementation 'com.google.code.gson:gson:2.10.1'

// Kotlin runtime + coroutines (SDK uses Dispatchers.IO internally)
implementation 'androidx.core:core-ktx:1.10.1'
implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3'
implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'

// GIF decoding for ad frames — MUST stay pinned at 1.2.25
implementation 'pl.droidsonroids.gif:android-gif-drawable:1.2.25'
```

### Pinned versions — do not bump

| Dep | Pin | Why |
|---|---|---|
| `pl.droidsonroids.gif:android-gif-drawable` | **1.2.25** | Newer builds emit Kotlin metadata whose classfile version D8 (bundled with AGP 7.1.2) rejects with a `NullPointerException`. |
| `androidx.media3:*` | **1.4.1** | The SDK is compiled against 1.4.x. Media3 sometimes breaks binary compatibility across minors (2.x major bump is a known break). |

### Version-conflict guards

If your project already declares older OkHttp/Gson (e.g. the OTT/PPTV
stack uses OkHttp 3.12.10 / Gson 2.8.2), Gradle's default resolution picks
the **highest** version, which is what you want. **Do not** add
`resolutionStrategy { force ... }` to pin them lower — the SDK uses OkHttp
4.x APIs and Gson 2.10 features and will crash on older versions.

### Jetifier

If you have `android.enableJetifier=true` in `gradle.properties`, Jetifier
will re-write the GIF library's Kotlin metadata and re-trigger the D8 NPE.
Exclude it:

```properties
android.jetifier.ignorelist=android-gif-drawable
```

## 6. Manifest & ProGuard

### AndroidManifest.xml

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

The SDK does not require any other permission. It never accesses storage,
camera, mic, or location.

### ProGuard / R8

The SDK ships pre-shrunk. No consumer rules are required. If you use full
R8 obfuscation and see `NoClassDefFoundError: com.microsoft.varender.*` at
runtime, add:

```proguard
-keep class com.microsoft.varender.** { *; }
-dontwarn com.microsoft.varender.**
```

## 7. Public API reference

All APIs are annotated with Media3's `@UnstableApi` — expected, safe to
suppress on your call sites.

### 7.1 `com.microsoft.varender.sdk.VirtualAdsSDK`

```java
// Constructors
new VirtualAdsSDK(String secretKey);
new VirtualAdsSDK(String secretKey, Environment env);
new VirtualAdsSDK(String secretKey, Environment env, String apiHost, String logHost);

// Data loading (suspend in Kotlin; call from a coroutine)
OverlayData loadOverlayData(String publisherVideoId,
                            String clientType,
                            List<String> userLabel);

// Effect factories
VirtualAdsEffect createEffect(OverlayData data,
                              boolean enableStartPtsIgnoreEditList,
                              boolean autoUpload,
                              Function1<ExposureEvent, Unit> onExposureEvent,
                              Function0<Integer> frameOffsetProvider,
                              Function0<Float> playbackSpeedProvider);

VirtualAdsEffect createEmptyEffect(boolean enableStartPtsIgnoreEditList, ...);

// Convenience one-shot loaders
VirtualAdsEffect loadAndCreateEffect(String publisherVideoId, ...);   // suspend
OverlayData      loadInto(VirtualAdsEffect effect, String publisherVideoId, ...); // suspend

// Java-friendly async wrapper
void loadIntoAsync(VirtualAdsEffect effect,
                   String publisherVideoId,
                   String clientType,
                   List<String> userLabel,
                   Callback<OverlayData> callback);

interface Callback<T> {
    void onSuccess(T result);
    void onError(Exception e);
}

// Manual exposure upload (only if you set autoUpload=false)
boolean uploadExposureLog(ExposureEvent event);   // suspend
void    uploadExposureLogAsync(ExposureEvent event);
```

### 7.2 `com.microsoft.varender.effect.VirtualAdsEffect`

A Media3 `VideoEffect` — hand it to `ExoPlayer.setVideoEffects(...)` before
`prepare()`.

```java
public boolean autoAnchorFirstPts;   // set to true for players with non-zero PTS baselines
void setOverlayData(OverlayData data);   // late-binding: swap or attach data
```

Do not extend, wrap, or subclass this effect — Media3's effect pipeline
holds strong references and lifecycle is fragile.

### 7.3 `com.microsoft.varender.data.Environment`

```java
Environment.PROD   // eastasia-01 production API + log hosts
Environment.DEV    // eastasia-01 development hosts (default)
Environment.custom(String apiHost, String logHost)   // for staging / mocks
```

Constants:

| Env | apiHost | logHost |
|---|---|---|
| PROD | `https://prodvafusionapi-g4dghgdmdkejandq.eastasia-01.azurewebsites.net` | `https://prodvafusionlogapi-a4c9e3bjdgchctae.eastasia-01.azurewebsites.net` |
| DEV  | `https://devvafusionapi-eqa8dmdyemg3hue5.eastasia-01.azurewebsites.net`  | `https://vafusionlogapi-arhmhfeye9h6hved.eastasia-01.azurewebsites.net` |

### 7.4 `com.microsoft.varender.sdk.VirtualAdsDebug`

```java
VirtualAdsDebug.trustAllCertificates();   // debug builds only — bypasses TLS validation
```

Do **not** ship this to production.

## 8. Integration patterns

There are two patterns depending on whether your player can tolerate an
extra 0.5–2 s at startup while overlay data is fetched.

### 8.1 Pattern A — synchronous load (simplest)

Best when you start playback from a user tap and can afford a small
network round-trip before `prepare()`.

**Kotlin:**

```kotlin
lifecycleScope.launch {
    val sdk = VirtualAdsSDK(SECRET_KEY, Environment.PROD)
    val effect = sdk.loadAndCreateEffect(
        publisherVideoId       = PUB_VIDEO_ID,
        enableStartPtsIgnoreEditList = false,
        playbackSpeedProvider  = { exoPlayer.playbackParameters.speed }
    )
    effect.autoAnchorFirstPts = true    // see §9
    exoPlayer.setVideoEffects(listOf(effect))
    exoPlayer.prepare()
    exoPlayer.playWhenReady = true
}
```

### 8.2 Pattern B — start playback immediately, attach ads when ready

Best for hosts that must not stall for network I/O (live/OTT stacks,
low-latency requirements). This is the pattern the PPTV OTT integration
uses.

**Java:**

```java
VirtualAdsSDK    sdk;
VirtualAdsEffect effect;

void initVirtualAdsSdk() {
    sdk = new VirtualAdsSDK(SECRET_KEY, Environment.PROD);

    // Empty effect — synchronous, no network, safe to hand to ExoPlayer NOW.
    effect = sdk.createEmptyEffect(/* enableStartPtsIgnoreEditList = */ false);
    effect.autoAnchorFirstPts = true;

    // Kick off overlay-data fetch in the background.
    sdk.loadIntoAsync(
        effect, PUB_VIDEO_ID, "mobile", java.util.Collections.emptyList(),
        new VirtualAdsSDK.Callback<OverlayData>() {
            @Override public void onSuccess(OverlayData data) {
                Log.i(TAG, "overlay data loaded: " + data.getElements().size() + " frames");
            }
            @Override public void onError(Exception e) {
                Log.w(TAG, "overlay data load failed — passthrough only", e);
            }
        });
}

/** Call from your player's "engine ready" callback, BEFORE prepare(). */
void attachToExoPlayer(androidx.media3.exoplayer.ExoPlayer exoPlayer) {
    exoPlayer.setVideoEffects(java.util.Collections.singletonList(effect));
}
```

Until `loadIntoAsync` succeeds the effect is a pure passthrough — video
renders normally, no ads and no exposure events. When data arrives, ads
light up on the **next** frame automatically.

### 8.3 When the host player swaps engines mid-playback

Some OTT/DRM stacks re-create their underlying ExoPlayer instance when the
user changes stream/quality. In that case you must re-attach the effect:

```java
private int attachedPlayerId = 0;

void attachIfChanged(ExoPlayer player) {
    if (player == null) return;
    int id = System.identityHashCode(player);
    if (id != attachedPlayerId) {
        player.setVideoEffects(java.util.Collections.singletonList(effect));
        attachedPlayerId = id;
    }
}
```

Call this from every "player initialized / prepared" callback the host
exposes.

## 9. PTS alignment — the two flags that decide everything

This is the #1 source of "the SDK doesn't render" support tickets. **Both
flags must be set correctly**.

### 9.1 `effect.autoAnchorFirstPts = true`

**Set this to `true`** unless you have specifically verified that your
first video frame arrives with PTS ≈ 0 μs.

Some player kernels (any pipeline wrapping ExoPlayer, some HLS servers,
some DRM decrypt paths) inject an artificial PTS baseline — one commonly
observed value is **10¹² μs (~11.6 days)**. The SDK's frame-index
computation is:

```
frameIndex = floor(pts_us * fps / 1_000_000)
```

If `pts_us` starts at 10¹² instead of 0, `frameIndex` starts around
**2.5 × 10⁷**, well beyond the overlay data's 0..N range → nothing draws,
ever.

With `autoAnchorFirstPts = true` the effect captures the first frame's PTS
and subtracts it from every subsequent frame, so the effective index starts
at 0. Healthy log:

```
VirtualAdsEffect: Auto-anchor first PTS: 1000000000000us
VirtualAdsEffect: SYNC_DEBUG: pts=0us (0.000s) [anchored, raw=1000000000000us] baseFrame=0 offset=0 finalFrame=0 hasOverlay=true
```

### 9.2 `enableStartPtsIgnoreEditList = false`

**Set this to `false` whenever `autoAnchorFirstPts = true`.**

When `enableStartPtsIgnoreEditList = true`, the SDK applies a small
`metadata.igPtsTime` offset (usually 2–3 frames) to compensate for the
MP4 edit list. This is meaningful in isolation, but once `autoAnchor`
already normalized the base to zero, the extra offset turns the first
frame's index **negative**:

```
finalFrame = -2   hasOverlay = false   // bad
```

With `enableStartPtsIgnoreEditList = false`:

```
finalFrame = 0    hasOverlay = true    // good
```

### 9.3 Decision matrix

| Player exposes PTS starting at ≈0? | `autoAnchorFirstPts` | `enableStartPtsIgnoreEditList` |
|---|---|---|
| Yes (rare — hand-rolled MediaCodec pipeline) | `false` | `true` |
| **No / unknown / any ExoPlayer wrapper** (default recommendation) | **`true`** | **`false`** |

## 10. Exposure logging & lifecycle

- Every effect keeps a per-ad-slot **frame counter** that is scaled by the
  current playback speed (`1.0 / playbackSpeed` per frame). Provide
  `playbackSpeedProvider = { exoPlayer.playbackParameters.speed }` so the
  scaling is correct when the user changes speed.
- When a slot ends (viewer scrubs away, ad time window closes, effect
  released), an `ExposureEvent` is emitted. If you constructed the effect
  with `autoUpload = true` (the default), the SDK POSTs the impression
  synchronously on a background dispatcher. Errors are logged only.
- To take control (e.g. batch, add retry, gate on user consent), pass
  `autoUpload = false` and handle `onExposureEvent` yourself, calling
  `sdk.uploadExposureLogAsync(event)` when appropriate.
- **Release the effect** when playback ends so remaining counters flush:
  ```java
  exoPlayer.clearVideoEffects();   // Media3 will release effect resources
  ```
  There is no explicit `effect.close()` — Media3 owns the lifecycle.

## 11. Environment / backend selection

```java
// Production
sdk = new VirtualAdsSDK(SECRET_KEY, Environment.PROD);

// Dev / staging (default when env omitted)
sdk = new VirtualAdsSDK(SECRET_KEY, Environment.DEV);

// Custom hosts (self-hosted, mock server, integration tests)
sdk = new VirtualAdsSDK(
    SECRET_KEY,
    Environment.DEV,   // fallback if either override is null
    /* apiHost = */ "https://my-api.example.com",
    /* logHost = */ "https://my-log.example.com"
);
```

For dev backends whose TLS cert is not trusted by the device (self-signed
in staging), you can bypass validation in **debug builds only**:

```java
if (BuildConfig.DEBUG) {
    VirtualAdsDebug.trustAllCertificates();
}
```

## 12. End-to-end verification checklist

Run through this list on device before shipping.

1. **Build succeeds** on JDK 17, AGP ≥ 7.1.2, no D8 NPEs.
2. **App launches** without `NoClassDefFoundError` from
   `com.microsoft.varender.*` — proves §5 deps are wired.
3. **Data loaded** — look for:
   ```
   VirtualAdsSDK: Overlay data loaded: N frames, M ad slots, fps=25.0, WIDTHxHEIGHT, deliveryId=<int>
   ```
   If N=0 or `deliveryId=null`, your `publisherVideoId` / `secretKey` are
   wrong for the selected environment.
4. **First frame draws overlay** — look for:
   ```
   VirtualAdsEffect: SYNC_DEBUG: pts=0us ... baseFrame=0 offset=0 finalFrame=0 hasOverlay=true
   ```
   If `hasOverlay=false` or `finalFrame` is negative/huge → §9.
5. **Exposure logs upload** — look for:
   ```
   VirtualAdsSDK: uploadExposureLog dispatch: slot='18' adProductId=23 frames=30
   ```
6. **No crashes on player disposal** — exit the video screen, come back,
   play a different video. No leaked GL resources / native crashes.

`adb` one-liner for filtering:

```
adb logcat -s VirtualAdsSDK:* VirtualAdsEffect:*
```

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `hasOverlay=false` on every frame; `finalFrame=-2` | `enableStartPtsIgnoreEditList=true` combined with `autoAnchorFirstPts=true` | Set `enableStartPtsIgnoreEditList = false` in `createEmptyEffect` / `createEffect`. |
| `hasOverlay=false`; `finalFrame` is huge (~25 000 000) | PTS baseline not normalized | Set `effect.autoAnchorFirstPts = true`. |
| No `Overlay data loaded` log; `onError` fires | Wrong env / wrong secret / wrong publisherVideoId / offline | Verify all three; try `Environment.PROD` if you were on DEV or vice versa. |
| `NoClassDefFoundError: okhttp3/…` or `com/google/gson/…` | §5 transitive deps missing | Add the block from §5. |
| `NoSuchMethodError: androidx.media3.…` | Media3 version mismatch | Force 1.4.1 across the module. |
| `D8: NullPointerException` at build time | JDK 21, or `android-gif-drawable > 1.2.25`, or Jetifier rewriting the GIF lib | JDK 17; pin GIF lib to 1.2.25; add `android.jetifier.ignorelist=android-gif-drawable`. |
| Effect never fires (`SYNC_DEBUG` never logs) | `setVideoEffects` called AFTER `prepare()` | Call BEFORE `prepare()`, or `clearVideoEffects()` + `setVideoEffects` + re-prepare. |
| Effect fires but overlays gone after quality/stream switch | Host re-created the underlying ExoPlayer | Re-attach (see §8.3). |
| `AbstractMethodError` / `IncompatibleClassChangeError` on effect | Legacy `com.google.android.exoplayer2` on classpath | Remove legacy ExoPlayer2 — only Media3 is supported. |
| TLS failure against dev backend | Self-signed cert not trusted | Debug only: `VirtualAdsDebug.trustAllCertificates()`. Do not ship. |

## 14. Build-toolchain constraints

- **JDK 17 required** — pin via `gradle.properties`:
  ```properties
  org.gradle.java.home=C:\\Program Files\\Microsoft\\jdk-17.0.19.10-hotspot
  ```
  Android Studio's default JBR-21 will produce class files (major version 65)
  that AGP 7.1.2's bundled D8 cannot read → NPE.
- **`compileOptions { sourceCompatibility 1.8; targetCompatibility 1.8 }`**
  must be a direct child of `android { }`. If you nest it inside
  `defaultConfig { }`, AGP 7.1.2 **silently ignores** it, javac falls back
  to the JVM default target, and D8 NPEs on the resulting bytecode.
- Do not enable `android.useAndroidX = false` — the SDK depends on AndroidX
  Media3 and core-ktx.
- Kotlin stdlib must be ≥ 1.8; the SDK was compiled with Kotlin 1.8.22.

## 15. FAQ

**Can I use this with legacy ExoPlayer2 (`com.google.android.exoplayer2`)?**
No. `VirtualAdsEffect` implements `androidx.media3.common.Effect`. Migrate
to Media3 first.

**Can I use it with `SurfaceView`? `TextureView`?**
Either works — Media3's effect pipeline plugs in below the surface. What
matters is that you feed frames through `ExoPlayer` and call
`setVideoEffects(...)` before `prepare()`.

**Does it work with DRM (Widevine / PlayReady)?**
Yes for L3 clear-output paths. L1 hardware-protected paths block Media3
effects entirely — the effect pipeline is bypassed and no overlays draw.
There is no workaround at the SDK level; it is a hardware DRM constraint.

**Does it support multiple simultaneous effects?**
Media3 does — pass a list. Ensure `VirtualAdsEffect` is either first or
last in the chain; ordering with color/scaling effects has not been
regression-tested.

**Where is the source code?**
The SDK is distributed as a binary in this repo. For source-level questions
or feature requests, open an issue linked in §16.

**What network calls does it make?**
Exactly two endpoint families:
- `POST {apiHost}/api/Preference/pubVideoId/{id}/delivery` (overlay data)
- `POST {logHost}/api/AdLog/AdProduct/{adProductId}/Delivery/{deliveryId}/Impression` (per-slot exposure)

No telemetry, no analytics beacon, no crash reporting.

## 16. Support

- File issues:
  <https://github.com/microsoft/Virtual-Product-Placement-Solution/issues>
- Include: SDK version, AGP version, JDK version, Media3 version, device
  model + Android version, and the `VirtualAdsSDK:* VirtualAdsEffect:*`
  logcat capture from §12.
