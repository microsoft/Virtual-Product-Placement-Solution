# Android ExoPlayer VARender SDK

ExoPlayer (AndroidX Media3) based **Virtual Ads Rendering SDK** for Android — the
Android counterpart of [`H5Player/`](../H5Player) in this repository.

The SDK attaches a GL `VirtualAdsEffect` shader to an ExoPlayer instance and
overlays product-placement ads on top of live video without touching the
publisher's playback pipeline.

## Requirements

- `minSdk` 24, `compileSdk` 34
- AGP 7.1+ (tested with 7.1.2), Kotlin 1.8+
- AndroidX Media3 1.4.1 (pinned — see [varender-sdk/build.gradle](varender-sdk/build.gradle))
- JDK 17

## Build

```bash
./gradlew :varender-sdk:assembleRelease
```

Output AAR: `varender-sdk/build/outputs/aar/varender-sdk-release.aar`

## Publish

To Maven Local (for local testing):

```bash
./gradlew :varender-sdk:publishToMavenLocal
```

To Maven Central (requires PGP key + Sonatype credentials as Gradle properties
`signingKey`, `signingPassword`, `sonatypeUsername`, `sonatypePassword`):

```bash
./gradlew :varender-sdk:publishReleasePublicationToSonatypeRepository
```

## Consume as a dependency

Once published to Maven Central:

```groovy
dependencies {
    implementation 'com.microsoft.varender:varender-sdk:1.0.0'
}
```

## Third-party components

| Component | License |
|---|---|
| `androidx.media3:media3-*` 1.4.1 | Apache-2.0 |
| `com.squareup.okhttp3:okhttp` 4.12.0 | Apache-2.0 |
| `com.google.code.gson:gson` 2.10.1 | Apache-2.0 |
| `org.jetbrains.kotlinx:kotlinx-coroutines-*` 1.7.3 | Apache-2.0 |
| `androidx.core:core-ktx` 1.10.1 | Apache-2.0 |
| `pl.droidsonroids.gif:android-gif-drawable` 1.2.25 | MIT |

## License

MIT — see the repository root [LICENSE.txt](../LICENSE.txt).
