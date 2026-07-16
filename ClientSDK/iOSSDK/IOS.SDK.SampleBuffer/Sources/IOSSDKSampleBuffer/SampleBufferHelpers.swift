//
//  SampleBufferHelpers.swift
//  IOSSDKSampleBuffer
//
//  Pure helpers for the AVSampleBufferDisplayLayer path. The SDK does not
//  ship a UIView for this path: a passive container around
//  `AVSampleBufferDisplayLayer` is ~20 lines of UIKit, easy for the host
//  to own (and customize). We only expose the non-trivial bit:
//  `CMSampleBuffer` construction with the `DisplayImmediately` attachment.
//
//  iOS-only (UIKit / AVFoundation). Guarded with `#if canImport(UIKit)`
//  so the macOS package build still compiles `MetalRenderer.swift`
//  standalone.
//

#if canImport(UIKit)

import AVFoundation
import CoreMedia
import CoreVideo

// MARK: - CMSampleBuffer Wrapping

/// Builds a `CMSampleBuffer` that wraps `pixelBuffer` with the given PTS.
/// The buffer is flagged `DisplayImmediately` because we assume the host
/// pacing already matches the video clock — enqueue order, not the layer's
/// control timebase, determines presentation.
///
/// Mirrors the volcengine doc sample
/// (https://www.volcengine.com/docs/4/1568183).
public func makeSampleBuffer(from pixelBuffer: CVPixelBuffer, pts: CMTime) -> CMSampleBuffer? {
    var formatDescription: CMVideoFormatDescription?
    let formatStatus = CMVideoFormatDescriptionCreateForImageBuffer(
        allocator: kCFAllocatorDefault,
        imageBuffer: pixelBuffer,
        formatDescriptionOut: &formatDescription
    )
    guard formatStatus == noErr, let formatDescription else { return nil }

    var timing = CMSampleTimingInfo(
        duration: .invalid,
        presentationTimeStamp: pts,
        decodeTimeStamp: .invalid
    )

    var sampleBuffer: CMSampleBuffer?
    let status = CMSampleBufferCreateForImageBuffer(
        allocator: kCFAllocatorDefault,
        imageBuffer: pixelBuffer,
        dataReady: true,
        makeDataReadyCallback: nil,
        refcon: nil,
        formatDescription: formatDescription,
        sampleTiming: &timing,
        sampleBufferOut: &sampleBuffer
    )
    guard status == noErr, let sampleBuffer else { return nil }

    if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true),
       CFArrayGetCount(attachments) > 0 {
        let dict = unsafeBitCast(
            CFArrayGetValueAtIndex(attachments, 0),
            to: CFMutableDictionary.self
        )
        CFDictionarySetValue(
            dict,
            Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
            Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
        )
    }

    return sampleBuffer
}

#endif
