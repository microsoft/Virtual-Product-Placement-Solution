//
//  SampleBufferDisplayView.swift
//  SimplePlayer.TT
//
//  Host-owned `UIView` around `AVSampleBufferDisplayLayer` plus a
//  SwiftUI bridge that wires the per-frame pipeline:
//      renderer.renderToPixelBuffer(...) → makeSampleBuffer(from:pts:) → enqueue
//

import SwiftUI
import UIKit
import AVFoundation
import CoreMedia
import IOSSDKSampleBuffer

// MARK: - SampleBufferDisplayUIView

/// `UIView` whose backing layer is an `AVSampleBufferDisplayLayer`. Tracks
/// `displayPixelSize` (`bounds × displayScale`) under a lock so it can be
/// sampled from the decode thread, and exposes `enqueue` / `flush`.
final class SampleBufferDisplayUIView: UIView {
    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }

    var displayLayer: AVSampleBufferDisplayLayer {
        // swiftlint:disable:next force_cast
        return layer as! AVSampleBufferDisplayLayer
    }

    private let sizeLock = NSLock()
    private var _displayPixelSize: CGSize = .zero

    /// Thread-safe view size in device pixels. `.zero` until first layout.
    var displayPixelSize: CGSize {
        sizeLock.lock()
        defer { sizeLock.unlock() }
        return _displayPixelSize
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        displayLayer.videoGravity = .resizeAspect
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        updateDisplayPixelSize()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        updateDisplayPixelSize()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        updateDisplayPixelSize()
    }

    private func updateDisplayPixelSize() {
        var scale = traitCollection.displayScale
        if scale == 0 { scale = window?.screen.scale ?? 0 }
        if scale == 0 { scale = UIScreen.main.scale }
        let size = CGSize(
            width: bounds.width * scale,
            height: bounds.height * scale
        )
        sizeLock.lock()
        _displayPixelSize = size
        sizeLock.unlock()
    }

    /// Enqueue a `CMSampleBuffer`. Flushes on iOS 16+ `.failed` status.
    func enqueue(_ sampleBuffer: CMSampleBuffer) {
        if #available(iOS 16.0, *), displayLayer.status == .failed {
            displayLayer.flush()
        }
        guard displayLayer.isReadyForMoreMediaData else { return }
        if Thread.isMainThread {
            displayLayer.enqueue(sampleBuffer)
        } else if #available(iOS 15.0, *) {
            displayLayer.enqueue(sampleBuffer)
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.displayLayer.enqueue(sampleBuffer)
            }
        }
    }

    func flush() {
        displayLayer.flush()
    }
}

// MARK: - SwiftUI bridge

struct SampleBufferDisplayView: UIViewRepresentable {
    let renderer: any Renderer
    let viewModel: PlayerViewModel

    func makeUIView(context: Context) -> SampleBufferDisplayUIView {
        let view = SampleBufferDisplayUIView()
        let renderer = self.renderer
        viewModel.onFrameReady = { [weak view, weak viewModel] pixelBuffer, pts in
            guard let view, let viewModel else { return }
            let videoPTS = CMTimeGetSeconds(pts)
            guard let processed = renderer.renderToPixelBuffer(
                pixelBuffer,
                overlays: viewModel.session.currentFrameOverlays,
                videoSize: viewModel.session.videoSize,
                currentVideoPTS: videoPTS.isFinite ? videoPTS : 0,
                displayPixelSize: view.displayPixelSize,
                useDeviceResolutionForRasterization: false
            ) else { return }
            guard let sampleBuffer = makeSampleBuffer(from: processed, pts: pts) else { return }
            view.enqueue(sampleBuffer)
        }
        return view
    }

    func updateUIView(_ uiView: SampleBufferDisplayUIView, context: Context) {}
}
