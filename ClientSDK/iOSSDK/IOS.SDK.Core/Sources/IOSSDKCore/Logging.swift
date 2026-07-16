//
//  Logging.swift
//  IOSSDKCore
//
//  Debug-only logging shim. `dlog` mirrors Swift's `print` for single-string
//  call sites but compiles to a no-op in Release.
//
//  Use `dlog("...")` everywhere we previously used `print("...")`. The
//  `@autoclosure` defers string interpolation entirely when `DEBUG` is
//  not defined, so there is **zero** runtime cost in Release.
//
//  Because the SPM packages are built in the same configuration as the
//  consuming app (Debug app → Debug SDK; Release app → Release SDK),
//  the `#if DEBUG` gate fires for every module on the same setting.
//

import Foundation

/// Logs a message to stdout in Debug builds. No-op in Release.
///
/// The message argument is `@autoclosure`, so any string interpolation
/// inside is only evaluated when DEBUG is defined.
@inlinable
public func dlog(_ message: @autoclosure () -> String) {
    #if DEBUG
    Swift.print(message())
    #endif
}
