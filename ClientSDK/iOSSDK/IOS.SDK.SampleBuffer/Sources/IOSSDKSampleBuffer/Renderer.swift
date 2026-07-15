//
//  Renderer.swift
//  IOSSDKSampleBuffer
//
//  Public surface for the AVSampleBufferDisplayLayer-based ad renderer.
//  Concrete `MetalRenderer` is SDK-internal; hosts get one via
//  `RendererFactory.make()`.
//

@_exported import IOSSDKCore
import Metal
import CoreVideo
import CoreGraphics

/// AVSampleBufferDisplayLayer-based ad renderer.
public protocol Renderer: AdRenderer {
    /// Composite `input` + `overlays` into a new BGRA pixel buffer the
    /// host wraps in a `CMSampleBuffer`. Accepts BGRA or NV12 input.
    /// When `useDeviceResolutionForRasterization == true` and
    /// `displayPixelSize` is non-zero, renders at display density;
    /// otherwise at input resolution.
    func renderToPixelBuffer(
        _ input: CVPixelBuffer,
        overlays: [OverlayElement],
        videoSize: CGSize,
        currentVideoPTS: TimeInterval,
        displayPixelSize: CGSize,
        useDeviceResolutionForRasterization: Bool
    ) -> CVPixelBuffer?
}

public enum RendererFactory {
    /// Returns `nil` if Metal is unavailable.
    public static func make() -> (any Renderer)? {
        MetalRenderer()
    }
}
