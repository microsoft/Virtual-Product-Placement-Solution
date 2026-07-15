//
//  Renderer.swift
//  IOSSDKNative
//
//  Public surface for the MTKView-based ad renderer. Concrete
//  `MetalRenderer` is SDK-internal; hosts get one via `RendererFactory.make()`.
//

@_exported import IOSSDKCore
import Metal
import MetalKit
import CoreVideo

/// MTKView-based ad renderer.
public protocol Renderer: AdRenderer {
    /// Metal device the renderer was created on. Needed by hosts to
    /// init their `MTKView(frame:, device:)`.
    var device: MTLDevice { get }

    /// Draw `pixelBuffer` with optional ad overlays into `view`'s current
    /// drawable. `overlays` are in source-video pixel space, normalized
    /// by `videoSize`; `currentVideoPTS` drives per-slot animation.
    func renderToDrawable(
        pixelBuffer: CVPixelBuffer,
        overlays: [OverlayElement],
        videoSize: CGSize,
        currentVideoPTS: TimeInterval,
        in view: MTKView
    )
}

public enum RendererFactory {
    /// Returns `nil` if Metal is unavailable.
    public static func make() -> (any Renderer)? {
        MetalRenderer()
    }
}
