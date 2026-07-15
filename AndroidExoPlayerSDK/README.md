# Virtual Ads Android SDK (ExoPlayer / Media3)

Binary distribution of the **Virtual Ads SDK** for Android apps that use
AndroidX Media3 ExoPlayer. The SDK overlays server-driven virtual ads onto
video frames via a Media3 `VideoEffect` and reports exposure back to the
Virtual-Product-Placement service.

| | |
|---|---|
| Artifact       | [`libs/varender-sdk-release.aar`](libs/varender-sdk-release.aar) |
| Version        | 1.0.0 |
| Package        | `com.microsoft.varender.sdk` |
| minSdk         | 24 |
| compileSdk     | 34 |
| License        | MIT (see repo root [`LICENSE`](../LICENSE)) |

## 1. Add the AAR to your app

Copy `libs/varender-sdk-release.aar` into your app module's `libs/` folder,
then in the module's `build.gradle`:

```groovy
android {
    compileSdk 34
    defaultConfig { minSdk 24 }
}

dependencies {
    implementation files('libs/varender-sdk-release.aar')

    // AARs don't ship transitive deps — declare them explicitly:
    def media3 = '1.4.1'
    implementation "androidx.media3:media3-exoplayer:$media3"
    implementation "androidx.media3:media3-effect:$media3"
    implementation "androidx.media3:media3-common:$media3"
    implementation "androidx.media3:media3-exoplayer-hls:$media3"

    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    implementation 'com.google.code.gson:gson:2.10.1'
    implementation 'androidx.core:core-ktx:1.10.1'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    implementation 'pl.droidsonroids.gif:android-gif-drawable:1.2.25'
}
```

> `android-gif-drawable` must be pinned to **1.2.25**. Newer builds emit
> Kotlin metadata that AGP 7.1.2's D8 rejects with a NullPointerException.

## 2. Manifest

The SDK needs internet access:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

## 3. Minimal integration

```java
import com.microsoft.varender.sdk.VirtualAdsSDK;
import com.microsoft.varender.effect.VirtualAdsEffect;
import com.microsoft.varender.data.OverlayData;

private static final String SECRET_KEY     = "<your-secret-key>";
private static final String PUB_VIDEO_ID   = "<publisher-video-id>";

private VirtualAdsSDK    sdk;
private VirtualAdsEffect effect;

void initSdk() {
    sdk = new VirtualAdsSDK(SECRET_KEY);

    // Synchronous, no network — safe to hand to ExoPlayer before prepare().
    effect = sdk.createEmptyEffect(/* enableStartPtsIgnoreEditList = */ false);
    effect.autoAnchorFirstPts = true;   // required for streams with non-zero PTS baselines

    sdk.loadIntoAsync(effect, PUB_VIDEO_ID, "mobile",
        java.util.Collections.emptyList(),
        new VirtualAdsSDK.Callback<OverlayData>() {
            @Override public void onSuccess(OverlayData d) { /* loaded */ }
            @Override public void onError(Exception e)     { /* handle */ }
        });
}

void attachToPlayer(androidx.media3.exoplayer.ExoPlayer player) {
    // Call BEFORE player.prepare().
    player.setVideoEffects(java.util.Collections.singletonList(effect));
}
```

## 4. PTS alignment (important)

Two flags must be set correctly, or the overlay will silently not render:

- **`effect.autoAnchorFirstPts = true`** — anchors the first frame's PTS to
  zero. Required on players that inject an artificial PTS baseline
  (e.g. some HLS pipelines expose a 10¹² μs baseline). Without this, frame
  indices land far outside the overlay range and nothing draws.
- **`enableStartPtsIgnoreEditList = false`** in `createEmptyEffect(...)` —
  disables the small `ig_pts_time` frame-index offset. When
  `autoAnchorFirstPts` is on, that offset causes the first frame to compute a
  negative index (`finalFrame=-2`, `hasOverlay=false`).

Healthy log signature (`adb logcat -s VirtualAdsSDK:* VirtualAdsEffect:*`):

```
VirtualAdsSDK  : Overlay data loaded: N frames, M ad slots, fps=25.0, ...
VirtualAdsEffect: Auto-anchor first PTS: 1000000000000us
VirtualAdsEffect: SYNC_DEBUG: pts=0us baseFrame=0 offset=0 finalFrame=0 hasOverlay=true
VirtualAdsSDK  : uploadExposureLog dispatch: slot='18' adProductId=23 frames=30
```

## 5. Environment selection

```java
import com.microsoft.varender.data.Environment;
sdk = new VirtualAdsSDK(SECRET_KEY, Environment.PROD);   // or Environment.DEV
```

For debug builds against a dev backend with an untrusted certificate:

```java
com.microsoft.varender.sdk.VirtualAdsDebug.trustAllCertificates();  // debug only
```

## 6. Public API surface

| Class | Purpose |
|---|---|
| `VirtualAdsSDK`     | Entry point. Creates effects, loads overlay data. |
| `VirtualAdsEffect`  | Media3 `VideoEffect` — pass to `ExoPlayer.setVideoEffects(...)`. |
| `OverlayData`       | Parsed overlay payload returned to `Callback.onSuccess`. |
| `Environment`       | `DEV` / `PROD`. |
| `VirtualAdsDebug`   | Debug-only helpers (e.g. trust-all-certs). |

## 7. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `finalFrame=-2` / `hasOverlay=false` in logs | `enableStartPtsIgnoreEditList` left on, or `autoAnchorFirstPts` off |
| `NoClassDefFoundError` / `NoSuchMethodError` at runtime | Transitive deps in §1 not declared |
| `D8: NullPointerException` at build time | `android-gif-drawable` upgraded past 1.2.25, or building with JDK 21 (use JDK 17) |
| No overlay ever renders, no `Overlay data loaded` log | Wrong `SECRET_KEY` / `PUB_VIDEO_ID`, or network blocked |

## 8. Support

File issues at
<https://github.com/microsoft/Virtual-Product-Placement-Solution/issues>.
