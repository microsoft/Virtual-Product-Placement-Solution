#!/usr/bin/env bash
#
# Build IOSSDKCore / IOSSDKNative / IOSSDKSampleBuffer as XCFrameworks for
# binary distribution. Outputs into ./Distribution/xcframeworks/ so the
# Distribution/Package.swift wrapper can pick them up via .binaryTarget.
#
# Usage:
#   ./Scripts/build-xcframeworks.sh                  # build all three
#   ./Scripts/build-xcframeworks.sh IOSSDKCore       # build a subset
#
# Requires Xcode + an iOS device toolchain installed. Run from repo root.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

OUT="$REPO_ROOT/Distribution/xcframeworks"
TMP="$REPO_ROOT/.build-xcf"
mkdir -p "$OUT" "$TMP"

# Map scheme → package directory (case for bash 3.2 compatibility).
pkg_dir_for() {
    case "$1" in
        IOSSDKCore)         echo "IOS.SDK.Core" ;;
        IOSSDKNative)       echo "IOS.SDK.Native" ;;
        IOSSDKSampleBuffer) echo "IOS.SDK.SampleBuffer" ;;
        *)                  echo "" ;;
    esac
}

# Selection: args or all
if [[ $# -gt 0 ]]; then
    TARGETS=("$@")
else
    TARGETS=(IOSSDKCore IOSSDKNative IOSSDKSampleBuffer)
fi

build_one() {
    local scheme="$1"
    local pkg_rel
    pkg_rel="$(pkg_dir_for "$scheme")"
    if [[ -z "$pkg_rel" ]]; then
        echo "Unknown scheme: $scheme" >&2
        exit 1
    fi
    local pkg="$REPO_ROOT/$pkg_rel"
    local ios_archive="$TMP/$scheme-ios.xcarchive"
    local sim_archive="$TMP/$scheme-iossim.xcarchive"
    local out_xcf="$OUT/$scheme.xcframework"

    echo
    echo "==> $scheme  ($pkg_rel)"

    rm -rf "$ios_archive" "$sim_archive" "$out_xcf"

    # Archive: iOS device
    (cd "$pkg" && BUILD_XCFRAMEWORK=1 xcodebuild archive \
        -scheme "$scheme" \
        -destination "generic/platform=iOS" \
        -archivePath "$ios_archive" \
        -configuration Release \
        -derivedDataPath "$TMP/dd-$scheme-ios" \
        SKIP_INSTALL=NO \
        BUILD_LIBRARY_FOR_DISTRIBUTION=YES \
        | xcbeautify --quiet 2>/dev/null || true) \
        || (cd "$pkg" && BUILD_XCFRAMEWORK=1 xcodebuild archive \
            -scheme "$scheme" \
            -destination "generic/platform=iOS" \
            -archivePath "$ios_archive" \
            -configuration Release \
            -derivedDataPath "$TMP/dd-$scheme-ios" \
            SKIP_INSTALL=NO \
            BUILD_LIBRARY_FOR_DISTRIBUTION=YES)

    # Archive: iOS simulator
    (cd "$pkg" && BUILD_XCFRAMEWORK=1 xcodebuild archive \
        -scheme "$scheme" \
        -destination "generic/platform=iOS Simulator" \
        -archivePath "$sim_archive" \
        -configuration Release \
        -derivedDataPath "$TMP/dd-$scheme-sim" \
        SKIP_INSTALL=NO \
        BUILD_LIBRARY_FOR_DISTRIBUTION=YES \
        | xcbeautify --quiet 2>/dev/null || true) \
        || (cd "$pkg" && BUILD_XCFRAMEWORK=1 xcodebuild archive \
            -scheme "$scheme" \
            -destination "generic/platform=iOS Simulator" \
            -archivePath "$sim_archive" \
            -configuration Release \
            -derivedDataPath "$TMP/dd-$scheme-sim" \
            SKIP_INSTALL=NO \
            BUILD_LIBRARY_FOR_DISTRIBUTION=YES)

    local ios_fw sim_fw
    ios_fw="$(find "$ios_archive/Products" -type d -name "$scheme.framework" -print -quit)"
    sim_fw="$(find "$sim_archive/Products" -type d -name "$scheme.framework" -print -quit)"
    if [[ -z "$ios_fw" ]] || [[ -z "$sim_fw" ]]; then
        echo "Expected framework missing inside archive:" >&2
        echo "  ios:  $ios_archive" >&2
        echo "  sim:  $sim_archive" >&2
        exit 1
    fi

    # SPM's archive flow doesn't copy the .swiftmodule (and its
    # .swiftinterface siblings) into the framework's Modules/ directory.
    # Without it, downstream targets can't `import` the framework. Copy
    # them in manually for each slice.
    inject_swiftmodule() {
        local framework="$1" derived="$2"
        local mod_src
        mod_src="$(find "$derived/Build/Intermediates.noindex/ArchiveIntermediates" \
            -type d -name "$scheme.swiftmodule" -path "*/BuildProductsPath/*" \
            -print -quit)"
        if [[ -z "$mod_src" ]]; then
            echo "swiftmodule not found in $derived" >&2
            exit 1
        fi
        rm -rf "$framework/Modules/$scheme.swiftmodule"
        mkdir -p "$framework/Modules"
        cp -R "$mod_src" "$framework/Modules/$scheme.swiftmodule"
    }
    inject_swiftmodule "$ios_fw" "$TMP/dd-$scheme-ios"
    inject_swiftmodule "$sim_fw" "$TMP/dd-$scheme-sim"

    # SPM bundles `.process` resources into `<Pkg>_<Target>.bundle` next
    # to the binary. The archive flow leaves it in BuildProductsPath but
    # doesn't embed it in the framework — copy it next to the binary so
    # `Bundle.module` resolves at runtime. Silent no-op if the target
    # ships no resources.
    inject_resource_bundle() {
        local framework="$1" derived="$2"
        local bundle_src
        bundle_src="$(find -L "$derived/Build/Intermediates.noindex/ArchiveIntermediates" \
            -type d -name "*_$scheme.bundle" -path "*/BuildProductsPath/*" \
            -print -quit 2>/dev/null)"
        if [[ -n "$bundle_src" ]]; then
            local bundle_name
            bundle_name="$(basename "$bundle_src")"
            rm -rf "$framework/$bundle_name"
            cp -RL "$bundle_src" "$framework/$bundle_name"
        fi
    }
    inject_resource_bundle "$ios_fw" "$TMP/dd-$scheme-ios"
    inject_resource_bundle "$sim_fw" "$TMP/dd-$scheme-sim"

    xcodebuild -create-xcframework \
        -framework "$ios_fw" \
        -framework "$sim_fw" \
        -output "$out_xcf"

    echo "    -> $out_xcf"
}

for t in "${TARGETS[@]}"; do
    build_one "$t"
done

echo
echo "Done. XCFrameworks written to:"
ls -d "$OUT"/*.xcframework 2>/dev/null || echo "(none)"
