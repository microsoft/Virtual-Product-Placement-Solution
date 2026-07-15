# Keep SDK public API
-keep class com.microsoft.varender.sdk.** { *; }

# android-gif-drawable: native JNI bindings; keep all reachable Java members
# Without these rules R8 may strip GifInfoHandle methods that the native code calls back into.
-keep class pl.droidsonroids.gif.** { *; }
-keep class pl.droidsonroids.gif.GifInfoHandle { *; }
-dontwarn pl.droidsonroids.gif.**