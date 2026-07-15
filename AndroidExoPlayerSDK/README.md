# Virtual Ads Android SDK — Integration Guide

A pre-built AAR that overlays server-driven virtual ads onto video played by
AndroidX Media3 ExoPlayer.

| Item | Value |
|---|---|
| Artifact   | [`libs/varender-sdk-release.aar`](libs/varender-sdk-release.aar) |
| Version    | 1.0.0 |
| minSdk     | 24 |
| Media3     | 1.4.1 |
| License    | MIT |

---

## 1. Add the AAR

Copy `libs/varender-sdk-release.aar` into your app module's `libs/` folder,
then in `app/build.gradle`:

```groovy
android {
    compileSdk 34
    defaultConfig { minSdk 24 }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    implementation files('libs/varender-sdk-release.aar')

    // AARs don't carry transitive deps — declare them explicitly:
    def media3 = '1.4.1'
    implementation "androidx.media3:media3-exoplayer:$media3"
    implementation "androidx.media3:media3-effect:$media3"
    implementation "androidx.media3:media3-common:$media3"
    implementation "androidx.media3:media3-exoplayer-hls:$media3"

    implementation 'com.squareup.okhttp3:okhttp:4.12.0'
    implementation 'com.google.code.gson:gson:2.10.1'
    implementation 'androidx.core:core-ktx:1.10.1'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    implementation 'pl.droidsonroids.gif:android-gif-drawable:1.2.25'
}
```

Add internet permission to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

## 2. Integrate

Three steps: create SDK, create effect, hand effect to ExoPlayer **before**
`prepare()`.

```java
import com.microsoft.varender.sdk.VirtualAdsSDK;
import com.microsoft.varender.effect.VirtualAdsEffect;
import com.microsoft.varender.data.Environment;
import com.microsoft.varender.data.OverlayData;

private VirtualAdsSDK    sdk;
private VirtualAdsEffect effect;

void initSdk(ExoPlayer exoPlayer) {
    sdk = new VirtualAdsSDK("<your-secret-key>", Environment.PROD);

    // 1) create an empty effect (no network) so we can attach it before prepare()
    effect = sdk.createEmptyEffect(/* enableStartPtsIgnoreEditList = */ false);
    effect.autoAnchorFirstPts = true;   // required — see §3

    // 2) attach BEFORE prepare()
    exoPlayer.setVideoEffects(java.util.Collections.singletonList(effect));

    // 3) load overlay data in the background; ads appear when data arrives
    sdk.loadIntoAsync(
        effect, "<publisher-video-id>", "mobile",
        java.util.Collections.emptyList(),
        new VirtualAdsSDK.Callback<OverlayData>() {
            @Override public void onSuccess(OverlayData d) { }
            @Override public void onError(Exception e)     { }
        });
}
```

That's it. When playback ends, `exoPlayer.clearVideoEffects()` releases the
effect.

## 3. Two flags you must set correctly

```java
effect = sdk.createEmptyEffect(/* enableStartPtsIgnoreEditList = */ false);
effect.autoAnchorFirstPts = true;
```

- `autoAnchorFirstPts = true` — anchors the first frame's PTS to 0. Required
  for any ExoPlayer wrapper that injects a non-zero PTS baseline (common in
  HLS / OTT stacks).
- `enableStartPtsIgnoreEditList = false` — must be `false` whenever
  `autoAnchorFirstPts` is `true`, otherwise the first frame index goes
  negative and no overlay renders.

If overlays never draw, this is almost always the cause.

## 4. Environment

```java
new VirtualAdsSDK(key, Environment.PROD);   // production
new VirtualAdsSDK(key, Environment.DEV);    // development (default)
```

## 5. Verify

Filter logs on device:

```
adb logcat -s VirtualAdsSDK:* VirtualAdsEffect:*
```

Healthy signature:

```
VirtualAdsSDK  : Overlay data loaded: N frames, M ad slots, ..., deliveryId=<int>
VirtualAdsEffect: SYNC_DEBUG: pts=0us ... finalFrame=0 hasOverlay=true
VirtualAdsSDK  : uploadExposureLog dispatch: slot='18' adProductId=23 frames=30
```

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `hasOverlay=false`, `finalFrame=-2` | Set `enableStartPtsIgnoreEditList = false`. |
| `hasOverlay=false`, `finalFrame` is huge | Set `effect.autoAnchorFirstPts = true`. |
| `NoClassDefFoundError` at runtime | Add all transitive deps from §1. |
| `D8: NullPointerException` at build | Build with JDK 17 (not 21); keep `android-gif-drawable` pinned at `1.2.25`. |
| Effect never fires | `setVideoEffects(...)` must be called **before** `prepare()`. |

Issues: <https://github.com/microsoft/Virtual-Product-Placement-Solution/issues>
