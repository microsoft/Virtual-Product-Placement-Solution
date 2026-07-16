//
//  MetalVideoView.swift
//  SimplePlayer.Native
//
//  SwiftUI/UIKit wrapper around `IOSSDKNative.Renderer`. Lives in the app
//  so it can bind to `PlayerViewModel`.
//

import SwiftUI
import MetalKit
import IOSSDKNative


// MARK: - MTKView-based Video View

class MetalVideoUIView: MTKView {
    var renderer: (any Renderer)?
    weak var viewModel: PlayerViewModel?

    private var currentPixelBuffer: CVPixelBuffer?

    init(renderer: any Renderer, viewModel: PlayerViewModel? = nil) {
        self.renderer = renderer
        self.viewModel = viewModel
        super.init(frame: .zero, device: renderer.device)
        self.isPaused = true                // We drive draws manually
        self.enableSetNeedsDisplay = false
        self.framebufferOnly = false
        self.colorPixelFormat = .bgra8Unorm
        self.sampleCount = 4                // 4x MSAA on geometric edges
        self.backgroundColor = .clear
    }

    @available(*, unavailable)
    required init(coder: NSCoder) { fatalError() }

    func display(pixelBuffer: CVPixelBuffer) {
        currentPixelBuffer = pixelBuffer
        draw()  // Trigger an immediate draw
    }

    override func draw(_ rect: CGRect) {	
        guard let pixelBuffer = currentPixelBuffer else { return }
        let overlays = viewModel?.session.currentFrameOverlays ?? []
        let videoSize = viewModel?.session.videoSize ?? .zero
        let pts = viewModel?.framePTS ?? 0
        renderer?.renderToDrawable(
            pixelBuffer: pixelBuffer,
            overlays: overlays,
            videoSize: videoSize,
            currentVideoPTS: pts,
            in: self
        )
    }
}

struct MetalVideoView: UIViewRepresentable {
    let renderer: any Renderer
    let viewModel: PlayerViewModel

    func makeUIView(context: Context) -> MetalVideoUIView {
        let view = MetalVideoUIView(renderer: renderer, viewModel: viewModel)
        viewModel.onFrameReady = { [weak view] pixelBuffer, pts in
            view?.display(pixelBuffer: pixelBuffer)
        }
        // Renderer signals ad textures ready → open the playback gate.
        renderer.onAdTexturesReady = { [weak session = self.viewModel.session] in
            session?.markAdsReady()
        }
        // Forward manifest load/clear to the renderer's texture pipeline.
        viewModel.session.onManifestChanged = { [weak renderer = self.renderer] parser in
            guard let renderer else { return }
            if let parser {
                renderer.loadAdTextures(for: parser)
            } else {
                renderer.clearAdTextures()
            }
        }
        // If manifest already loaded before the view existed, kick now.
        if let parser = viewModel.session.manifest {
            renderer.loadAdTextures(for: parser)
        }
        return view
    }

    func updateUIView(_ uiView: MetalVideoUIView, context: Context) {}
}

