//
//  MetalRenderer.swift
//  IOS.SDK.SampleBuffer
//
//  Re-exports `IOSSDKCore` so consumers only need `import IOSSDKSampleBuffer`.
//
//  Mirrors `IOS.SDK.Native/MetalRenderer.swift` but targets
//  `AVSampleBufferDisplayLayer` instead of an `MTKView`: each call to
//  `renderToPixelBuffer(...)` returns a freshly-pooled BGRA `CVPixelBuffer`
//  that the host wraps in a `CMSampleBuffer` and enqueues on the layer.
//  Accepts either BGRA or NV12 input pixel buffers, so the video pass
//  picks pipeline + textures per-frame.
//

@_exported import IOSSDKCore
import Metal
import MetalKit
import CoreVideo
import CoreMedia
import AVFoundation
import SwiftUI
import simd

/// CPU-side mirror of `OverlayUniforms` in Shaders.metal. Layout must match
/// exactly — order, types and alignment.
private struct OverlayUniforms {
    public var brightness: Float
    public var enableInnerShadow: Int32  // 0 = off, 1 = on
    public var samplesX: Int32
    public var samplesY: Int32
}

/// Per-slot rendering parameters extracted from `AdSlot` at manifest-load time.
private struct AdSlotRenderInfo {
    public let brightness: Float
    public let enableInnerShadow: Bool
}

final class MetalRenderer: Renderer {
    let device: MTLDevice
    let commandQueue: MTLCommandQueue
    private var textureCache: CVMetalTextureCache
    /// Pipeline for inputs that already arrive as 32-bit BGRA.
    private let pipelineStateBGRA: MTLRenderPipelineState
    /// Pipeline for inputs that arrive as NV12 (biplanar Y + interleaved CbCr).
    /// Performs YUV → RGB inside the fragment shader.
    private let pipelineStateYUV: MTLRenderPipelineState
    /// Pipeline for compositing ad-overlay quads on top of the video.
    /// Mirrors `overlayPipelineState` in SimplePlayer.Native.
    private let overlayPipelineState: MTLRenderPipelineState
    private let sampler: MTLSamplerState

    /// Static 4-vertex tex-coord buffer (TL/TR/BR/BL) shared by every overlay quad.
    private let overlayTexCoordBuffer: MTLBuffer
    /// Static 6-index buffer `[0, 3, 1, 1, 3, 2]` matching H5Player's winding.
    private let overlayIndexBuffer: MTLBuffer
    /// Mock ad texture (`checkboard.png`). Used as a fallback when a slot's
    /// real texture failed to download or hasn't arrived yet.
    private var mockAdTexture: MTLTexture?

    /// Per-slot ad timelines keyed by `OverlayElement.id`.
    /// Stills are 1-frame; GIF / APNG / animated WebP are N-frame.
    /// Slots missing here fall back to `mockAdTexture`.
    private var adTimelines: [String: AdTextureTimeline] = [:]

    /// Per-slot "first visible" anchor in video PTS (seconds). Active
    /// frame for animated assets = `currentVideoPTS - anchor`.
    private var adAnchorVideoPTS: [String: TimeInterval] = [:]

    /// Per-slot uniform inputs (brightness, inner-shadow toggle).
    private var adSlotInfos: [String: AdSlotRenderInfo] = [:]

    /// Fires on main actor once `loadAdTextures(for:)` has prepared every
    /// per-slot texture. Hooked by `PlayerViewModel.isAdsReady`.
    var onAdTexturesReady: (() -> Void)?

    // Pool used to vend output CVPixelBuffers for the render-to-pixel-buffer path.
    // Recreated when the input dimensions change.
    private var pixelBufferPool: CVPixelBufferPool?
    private var poolWidth: Int = 0
    private var poolHeight: Int = 0

    /// 4x MSAA color attachment, lazily (re-)allocated whenever the render
    /// target size changes. The render pass writes here and Metal resolves
    /// into the CVPixelBuffer's single-sample IOSurface texture at
    /// `endEncoding`.
    private var msaaColorTexture: MTLTexture?
    private var msaaWidth: Int = 0
    private var msaaHeight: Int = 0
    private static let renderSampleCount: Int = 4

    /// Logged once on the first frame so we can confirm the SDK's output format.
    private var didLogInputFormat = false

    /// Optional debug-only PNG dumper for resolved output buffers. `nil` by
    /// default — dumping is fully disabled and has zero per-frame cost. Host
    /// apps that want to inspect MSAA / sampler output offline can attach a
    /// `FrameDumper` instance (typically inside `#if DEBUG`) via this
    /// property or the `enableFrameDump(directory:maxFrames:)` helper.
    var frameDumper: FrameDumper?

    init?() {
        guard let device = MTLCreateSystemDefaultDevice(),
              let commandQueue = device.makeCommandQueue() else { return nil }

        self.device = device
        self.commandQueue = commandQueue

        var cache: CVMetalTextureCache?
        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &cache)
        guard let textureCache = cache else { return nil }
        self.textureCache = textureCache

        // Build render pipelines (one per input format).
        let library: MTLLibrary
        do {
            library = try device.makeDefaultLibrary(bundle: .module)
        } catch {
            dlog("❌ Failed to load Metal default library from SPM bundle: \(error)")
            return nil
        }
        guard let vertexFunc = library.makeFunction(name: "vertexPassthrough"),
              let fragBGRA = library.makeFunction(name: "fragmentShader"),
              let fragYUV = library.makeFunction(name: "fragmentShaderYUV")
        else { return nil }

        func makePipeline(_ frag: MTLFunction) -> MTLRenderPipelineState? {
            let desc = MTLRenderPipelineDescriptor()
            desc.vertexFunction = vertexFunc
            desc.fragmentFunction = frag
            desc.colorAttachments[0].pixelFormat = .bgra8Unorm
            desc.rasterSampleCount = MetalRenderer.renderSampleCount
            return try? device.makeRenderPipelineState(descriptor: desc)
        }

        guard let pipeBGRA = makePipeline(fragBGRA),
              let pipeYUV = makePipeline(fragYUV)
        else { return nil }
        self.pipelineStateBGRA = pipeBGRA
        self.pipelineStateYUV = pipeYUV

        // Build overlay render pipeline (perspective-correct quad with texture).
        // Mirrors the Native renderer's overlay pipeline exactly.
        guard let overlayVertexFunc = library.makeFunction(name: "overlayVertex"),
              let overlayFragFunc = library.makeFunction(name: "overlayFragment")
        else { return nil }

        let overlayVertexDesc = MTLVertexDescriptor()
        // attribute(0): position float4 @ offset 0, buffer 0
        overlayVertexDesc.attributes[0].format = .float4
        overlayVertexDesc.attributes[0].offset = 0
        overlayVertexDesc.attributes[0].bufferIndex = 0
        // attribute(1): texCoord float2 @ offset 0, buffer 1
        overlayVertexDesc.attributes[1].format = .float2
        overlayVertexDesc.attributes[1].offset = 0
        overlayVertexDesc.attributes[1].bufferIndex = 1
        overlayVertexDesc.layouts[0].stride = MemoryLayout<SIMD4<Float>>.stride
        overlayVertexDesc.layouts[1].stride = MemoryLayout<SIMD2<Float>>.stride

        let overlayDesc = MTLRenderPipelineDescriptor()
        overlayDesc.vertexFunction = overlayVertexFunc
        overlayDesc.fragmentFunction = overlayFragFunc
        overlayDesc.vertexDescriptor = overlayVertexDesc
        overlayDesc.colorAttachments[0].pixelFormat = .bgra8Unorm
        overlayDesc.rasterSampleCount = MetalRenderer.renderSampleCount
        // Standard alpha blending so the overlay composites on top of the video.
        overlayDesc.colorAttachments[0].isBlendingEnabled = true
        overlayDesc.colorAttachments[0].rgbBlendOperation = .add
        overlayDesc.colorAttachments[0].alphaBlendOperation = .add
        overlayDesc.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
        overlayDesc.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        overlayDesc.colorAttachments[0].sourceAlphaBlendFactor = .one
        overlayDesc.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha

        guard let overlayPipeline = try? device.makeRenderPipelineState(descriptor: overlayDesc)
        else { return nil }
        self.overlayPipelineState = overlayPipeline

        // Static tex-coord buffer (TL, TR, BR, BL) and index buffer.
        let texCoords: [SIMD2<Float>] = [
            SIMD2(0, 0), // TL
            SIMD2(1, 0), // TR
            SIMD2(1, 1), // BR
            SIMD2(0, 1)  // BL
        ]
        guard let texCoordBuf = device.makeBuffer(
            bytes: texCoords,
            length: MemoryLayout<SIMD2<Float>>.stride * texCoords.count,
            options: []
        ) else { return nil }
        self.overlayTexCoordBuffer = texCoordBuf

        // Indices match H5Player: triangles (TL, BL, TR) and (TR, BL, BR).
        let indices: [UInt16] = [0, 3, 1, 1, 3, 2]
        guard let indexBuf = device.makeBuffer(
            bytes: indices,
            length: MemoryLayout<UInt16>.stride * indices.count,
            options: []
        ) else { return nil }
        self.overlayIndexBuffer = indexBuf

        // Build sampler
        let samplerDesc = MTLSamplerDescriptor()
        samplerDesc.minFilter = .linear
        samplerDesc.magFilter = .linear
        // Trilinear: smooth mip transitions over ad textures that ship
        // with a full mip chain (see `AdTextureLoader.generateMipmapsOnGPU`).
        samplerDesc.mipFilter = .linear
        // Anisotropic filtering. Without this, slanted ad quads alias
        // along the long axis because trilinear picks one mip level from
        // max(|dUV/dx|, |dUV/dy|), under-sampling the other axis.
        samplerDesc.maxAnisotropy = 16
        samplerDesc.sAddressMode = .clampToEdge
        samplerDesc.tAddressMode = .clampToEdge
        guard let sampler = device.makeSamplerState(descriptor: samplerDesc)
        else { return nil }
        self.sampler = sampler

        // Load the mock ad texture (checkboard.png) from the app bundle.
        loadMockAdTexture()
    }

    /// Load `checkboard.png` from the main bundle into `mockAdTexture`.
    private func loadMockAdTexture() {
        guard let url = Bundle.module.url(forResource: "checkboard", withExtension: "png") else {
            dlog("⚠️ checkboard.png not found in bundle; ad overlays will be skipped")
            return
        }
        let loader = MTKTextureLoader(device: device)
        do {
            mockAdTexture = try loader.newTexture(
                URL: url,
                options: [
                    .SRGB: false,
                    .generateMipmaps: true,
                    .textureUsage: NSNumber(value: MTLTextureUsage.shaderRead.rawValue)
                ]
            )
            dlog("✅ Loaded mock ad texture: \(mockAdTexture?.width ?? 0)x\(mockAdTexture?.height ?? 0) (mips=\(mockAdTexture?.mipmapLevelCount ?? 0))")
        } catch {
            dlog("❌ Failed to load checkboard.png: \(error)")
        }
    }

    // MARK: - Frame dump API (thin wrappers around `FrameDumper`)

    /// Attach a `FrameDumper` that writes the next `maxFrames` resolved
    /// output buffers to `<directory>/frame_NNNN.png`. Disabled by default;
    /// the renderer has zero per-frame dump cost unless this is called.
    ///
    /// See `FrameDumper` for details (Photos library mirror, directory
    /// cleanup, etc.).
    func enableFrameDump(directory: URL, maxFrames: Int) {
        frameDumper = FrameDumper(directory: directory, maxFrames: maxFrames)
    }

    /// Detach the current `FrameDumper`, stopping any further dumps.
    func disableFrameDump() {
        frameDumper = nil
    }

    /// Register an ad-slot timeline. Must be called on the main thread
    /// (textures are read during the on-main draw pass).
    @MainActor
    func setAdTimeline(_ timeline: AdTextureTimeline, forAdIndex adIndex: String) {
        adTimelines[adIndex] = timeline
    }

    /// Drop all registered ad timelines / per-slot uniforms / animation
    /// anchors. Called on reset / when swapping videos.
    @MainActor
    func clearAdTextures() {
        adTimelines.removeAll()
        adSlotInfos.removeAll()
        adAnchorVideoPTS.removeAll()
    }

    /// Mirrors `MetalRenderer.loadAdTextures(for:)` in SimplePlayer.Native.
    /// Kicks off async download → pad → mipmap upload for every slot in the
    /// parser via `AdTextureLoader`, registering each result through
    /// `setAdTexture`. When the entire batch finishes (success *or* failure)
    /// the `onAdTexturesReady` callback fires so the view-model can open its
    /// playback gate. Slots whose download failed simply fall back to
    /// `mockAdTexture` at draw time.
    @MainActor
    func loadAdTextures(for parser: AdManifestParser) {
        let slots = parser.allAdSlots
        adTimelines.removeAll()
        adSlotInfos.removeAll()
        adAnchorVideoPTS.removeAll()
        if slots.isEmpty {
            dlog("🟢 [TT] Manifest has no ad slots — releasing playback gate")
            onAdTexturesReady?()
            return
        }
        // Populate uniforms synchronously so SSAA / brightness / inner-shadow
        // already have correct values when the first frame draws — even before
        // the texture download has finished.
        for slot in slots {
            adSlotInfos[slot.adIndex] = AdSlotRenderInfo(
                brightness: Float(slot.brightness),
                enableInnerShadow: slot.enableInnerShadow
            )
        }

        let loader = AdTextureLoader(device: device)
        Task { @MainActor [weak self] in
            for slot in slots {
                if let timeline = await loader.loadTimeline(for: slot) {
                    self?.setAdTimeline(timeline, forAdIndex: slot.adIndex)
                    let base = timeline.frames[0].texture
                    dlog("✅ [TT] Ad timeline ready adIndex=\(slot.adIndex) frames=\(timeline.frames.count) loop=\(String(format: "%.3f", timeline.loopDuration))s base=\(base.width)x\(base.height) mips=\(base.mipmapLevelCount)")
                } else {
                    dlog("⚠️ [TT] Ad texture missing for adIndex=\(slot.adIndex), falling back to mock at draw time")
                }
            }
            dlog("🟢 [TT] All ad textures processed (\(slots.count) slot\(slots.count == 1 ? "" : "s")) — releasing playback gate")
            self?.onAdTexturesReady?()
        }
    }

    /// Zero-copy: wraps a single plane of the CVPixelBuffer's IOSurface as an MTLTexture.
    /// `plane = 0` for packed (BGRA) buffers, or for the Y plane of NV12.
    /// `plane = 1` for the interleaved CbCr plane of NV12.
    func makePlaneTexture(from pixelBuffer: CVPixelBuffer,
                          plane: Int,
                          format: MTLPixelFormat) -> MTLTexture? {
        let isPlanar = CVPixelBufferIsPlanar(pixelBuffer)
        let width = isPlanar
            ? CVPixelBufferGetWidthOfPlane(pixelBuffer, plane)
            : CVPixelBufferGetWidth(pixelBuffer)
        let height = isPlanar
            ? CVPixelBufferGetHeightOfPlane(pixelBuffer, plane)
            : CVPixelBufferGetHeight(pixelBuffer)

        var cvTexture: CVMetalTexture?
        let status = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault,
            textureCache,
            pixelBuffer,
            nil,
            format,
            width,
            height,
            plane,
            &cvTexture
        )

        guard status == kCVReturnSuccess, let cvTex = cvTexture else { return nil }
        return CVMetalTextureGetTexture(cvTex)
    }

    /// Convenience wrapper for packed BGRA inputs (back-compat with previous API).
    func makeTexture(from pixelBuffer: CVPixelBuffer) -> MTLTexture? {
        return makePlaneTexture(from: pixelBuffer, plane: 0, format: .bgra8Unorm)
    }

    /// Render the fragment shader and present the result directly to an MTKView's drawable.
    /// Note: only handles BGRA input. The TT pipeline uses `renderToPixelBuffer` instead
    /// which understands NV12 too.
    func renderToDrawable(pixelBuffer: CVPixelBuffer, in view: MTKView) {
        guard let inputTexture = makeTexture(from: pixelBuffer),
              let drawable = view.currentDrawable,
              let commandBuffer = commandQueue.makeCommandBuffer()
        else { return }

        let passDesc = view.currentRenderPassDescriptor ?? MTLRenderPassDescriptor()
        passDesc.colorAttachments[0].texture = drawable.texture
        passDesc.colorAttachments[0].loadAction = .dontCare
        passDesc.colorAttachments[0].storeAction = .store

        guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: passDesc)
        else { return }

        encoder.setRenderPipelineState(pipelineStateBGRA)
        encoder.setFragmentTexture(inputTexture, index: 0)
        encoder.setFragmentSamplerState(sampler, index: 0)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
        encoder.endEncoding()

        commandBuffer.present(drawable)
        commandBuffer.commit()
    }

    /// Run the fragment shader against `input` and return a *new* CVPixelBuffer
    /// (drawn from an internal pool) holding the processed result. Used by the
    /// AVSampleBufferDisplayLayer pipeline so we can wrap the output as a
    /// CMSampleBuffer with the original PTS.
    ///
    /// If `overlays` is non-empty and `videoSize` is valid, the corresponding
    /// ad quads are composited on top of the video in the same render pass
    /// (mirrors SimplePlayer.Native's `renderToDrawable` overlay path).
    /// `currentVideoPTS` is the seconds-based PTS of the just-decoded frame
    /// and drives the per-slot GIF animation timeline (pass
    /// `viewModel.framePTS`).
    ///
    /// `displayPixelSize` is the size of the destination display surface in
    /// *device pixels*. When `useDeviceResolutionForRasterization == true`
    /// and this is non-zero, the renderer sizes its output buffer + MSAA
    /// color attachment so that a single buffer pixel maps 1:1 to a screen
    /// pixel inside the aspect-fit displayed video region. This matches
    /// what MTKView gives the Native SDK and avoids the extra upscale blur
    /// introduced by `AVSampleBufferDisplayLayer` when the buffer is
    /// smaller than its displayed region.
    ///
    /// Defaults to `false` — rasterize at the input `CVPixelBuffer`'s
    /// resolution regardless of the display size. The same fallback kicks
    /// in automatically when `displayPixelSize == .zero` (e.g. the view
    /// hasn't been laid out yet).
    func renderToPixelBuffer(
        _ input: CVPixelBuffer,
        overlays: [OverlayElement] = [],
        videoSize: CGSize = .zero,
        currentVideoPTS: TimeInterval = 0,
        displayPixelSize: CGSize = .zero,
        useDeviceResolutionForRasterization: Bool = false
    ) -> CVPixelBuffer? {
        let width = CVPixelBufferGetWidth(input)
        let height = CVPixelBufferGetHeight(input)
        let format = CVPixelBufferGetPixelFormatType(input)

        // Choose the render-target resolution.
        //
        // When `useDeviceResolutionForRasterization == true` and the caller
        // has supplied a valid `displayPixelSize`, scale the output buffer so
        // 1 buffer pixel ≈ 1 screen pixel inside the aspect-fit region.
        // `AVSampleBufferDisplayLayer` uses `.resizeAspect`, so the displayed
        // video region's extent in screen pixels is
        // `min(viewW/videoW, viewH/videoH) * videoSize`. We preserve the
        // input aspect (keeps AVSBDL from distorting) but scale up/down so
        // overlay quads + ad-texture mip selection happen at display density.
        //
        // Otherwise (toggle off, or `displayPixelSize == .zero` because the
        // view isn't laid out yet), fall back to the input CVPixelBuffer's
        // resolution.
        let outWidth: Int
        let outHeight: Int
        if useDeviceResolutionForRasterization,
           displayPixelSize.width > 0, displayPixelSize.height > 0,
           width > 0, height > 0 {
            let videoW = CGFloat(width)
            let videoH = CGFloat(height)
            let displayedScale = min(
                displayPixelSize.width  / videoW,
                displayPixelSize.height / videoH
            )
            outWidth  = max(1, Int((videoW * displayedScale).rounded()))
            outHeight = max(1, Int((videoH * displayedScale).rounded()))
        } else {
            outWidth = width
            outHeight = height
        }

        if !didLogInputFormat {
            didLogInputFormat = true
            dlog("🎨 [MetalRenderer] first frame: input \(width)x\(height) format=\(fourCC(format)) — display \(Int(displayPixelSize.width))x\(Int(displayPixelSize.height))px useDeviceResolutionForRasterization=\(useDeviceResolutionForRasterization) → render target \(outWidth)x\(outHeight)")
        }

        guard let pool = ensurePool(width: outWidth, height: outHeight) else { return nil }

        var output: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &output) == kCVReturnSuccess,
              let outputBuffer = output else {
            return nil
        }

        guard let outputTexture = makePlaneTexture(from: outputBuffer, plane: 0, format: .bgra8Unorm),
              let msaaTexture = ensureMSAATexture(width: outWidth, height: outHeight),
              let commandBuffer = commandQueue.makeCommandBuffer() else {
            return nil
        }

        let passDesc = MTLRenderPassDescriptor()
        passDesc.colorAttachments[0].texture = msaaTexture
        passDesc.colorAttachments[0].resolveTexture = outputTexture
        passDesc.colorAttachments[0].loadAction = .dontCare
        passDesc.colorAttachments[0].storeAction = .multisampleResolve

        guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: passDesc) else {
            return nil
        }

        encoder.setFragmentSamplerState(sampler, index: 0)

        // Pass 1: full-screen video. Branch on the *actual* input pixel format.
        // Treating an NV12 buffer as BGRA produced the "4 tiled subimages"
        // artifact we saw historically.
        switch format {
        case kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
             kCVPixelFormatType_420YpCbCr8BiPlanarFullRange:
            guard let yTex = makePlaneTexture(from: input, plane: 0, format: .r8Unorm),
                  let uvTex = makePlaneTexture(from: input, plane: 1, format: .rg8Unorm) else {
                encoder.endEncoding()
                return nil
            }
            encoder.setRenderPipelineState(pipelineStateYUV)
            encoder.setFragmentTexture(yTex, index: 0)
            encoder.setFragmentTexture(uvTex, index: 1)
        default:
            // Assume a packed 32-bit BGRA buffer.
            guard let inputTexture = makePlaneTexture(from: input, plane: 0, format: .bgra8Unorm) else {
                encoder.endEncoding()
                return nil
            }
            encoder.setRenderPipelineState(pipelineStateBGRA)
            encoder.setFragmentTexture(inputTexture, index: 0)
        }

        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)

        // Pass 2: ad overlays. Slots whose texture isn't ready yet are
        // skipped (no `mockAdTexture` placeholder) to avoid a checkboard
        // flash before the real image finishes downloading.
        let overlayPassDrawn = !overlays.isEmpty
            && videoSize.width > 0 && videoSize.height > 0
        if overlayPassDrawn {
            encoder.setRenderPipelineState(overlayPipelineState)
            encoder.setFragmentSamplerState(sampler, index: 0)
            encoder.setVertexBuffer(overlayTexCoordBuffer, offset: 0, index: 1)

            // Anchor bookkeeping: set on first appearance, drop on exit.
            let activeIDs = Set(overlays.map(\.id))
            adAnchorVideoPTS = adAnchorVideoPTS.filter { activeIDs.contains($0.key) }
            for overlay in overlays where adAnchorVideoPTS[overlay.id] == nil {
                adAnchorVideoPTS[overlay.id] = currentVideoPTS
            }

            for overlay in overlays {
                guard let timeline = adTimelines[overlay.id] else { continue }
                let anchor = adAnchorVideoPTS[overlay.id] ?? currentVideoPTS
                let tex = timeline.frame(atRelativeTime: currentVideoPTS - anchor).texture
                encoder.setFragmentTexture(tex, index: 0)

                let info = adSlotInfos[overlay.id]
                var uniforms = OverlayUniforms(
                    brightness: info?.brightness ?? 1.0,
                    enableInnerShadow: (info?.enableInnerShadow ?? false) ? 1 : 0,
                    samplesX: 32,
                    samplesY: 32
                )
                encoder.setFragmentBytes(
                    &uniforms,
                    length: MemoryLayout<OverlayUniforms>.stride,
                    index: 0
                )

                let quad = overlay.clipSpaceQuad(videoSize: videoSize)
                quad.withUnsafeBufferPointer { ptr in
                    encoder.setVertexBytes(
                        ptr.baseAddress!,
                        length: MemoryLayout<SIMD4<Float>>.stride * 4,
                        index: 0
                    )
                }
                encoder.drawIndexedPrimitives(
                    type: .triangle,
                    indexCount: 6,
                    indexType: .uint16,
                    indexBuffer: overlayIndexBuffer,
                    indexBufferOffset: 0
                )
            }
        }

        encoder.endEncoding()

        commandBuffer.commit()
        // Block until the GPU has filled the output buffer. Frame callback runs
        // on the SDK's decode thread, so a brief wait here is fine and keeps
        // ownership of the IOSurface simple before we hand it to the display layer.
        commandBuffer.waitUntilCompleted()

        // Optional: dump the resolved output for offline antialiasing
        // inspection. No-op when `frameDumper` is nil (the default) or once
        // its budget is exhausted.
        frameDumper?.dumpIfNeeded(outputBuffer)

        return outputBuffer
    }

    private func ensurePool(width: Int, height: Int) -> CVPixelBufferPool? {
        if let pool = pixelBufferPool, width == poolWidth, height == poolHeight {
            return pool
        }
        let attrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:],
            kCVPixelBufferMetalCompatibilityKey as String: true
        ]
        var pool: CVPixelBufferPool?
        guard CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, attrs as CFDictionary, &pool) == kCVReturnSuccess,
              let p = pool else {
            return nil
        }
        pixelBufferPool = p
        poolWidth = width
        poolHeight = height
        return p
    }

    /// (Re-)allocate the MSAA color attachment matching `width` x `height`,
    /// using `renderSampleCount` samples. The texture is `.private` storage
    /// and `.renderTarget` only — it never leaves the GPU; Metal box-resolves
    /// it into `outputTexture` at `endEncoding` via
    /// `storeAction = .multisampleResolve`.
    private func ensureMSAATexture(width: Int, height: Int) -> MTLTexture? {
        if let tex = msaaColorTexture, width == msaaWidth, height == msaaHeight {
            return tex
        }
        let desc = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm,
            width: width,
            height: height,
            mipmapped: false
        )
        desc.textureType = .type2DMultisample
        desc.sampleCount = MetalRenderer.renderSampleCount
        desc.usage = .renderTarget
        desc.storageMode = .private
        guard let tex = device.makeTexture(descriptor: desc) else {
            dlog("❌ Failed to allocate \(MetalRenderer.renderSampleCount)x MSAA texture \(width)x\(height)")
            return nil
        }
        msaaColorTexture = tex
        msaaWidth = width
        msaaHeight = height
        return tex
    }

    /// Decode a 4-character pixel format code to a printable string (e.g. '420v', 'BGRA').
    private func fourCC(_ code: OSType) -> String {
        let bytes: [UInt8] = [
            UInt8((code >> 24) & 0xFF),
            UInt8((code >> 16) & 0xFF),
            UInt8((code >>  8) & 0xFF),
            UInt8( code        & 0xFF),
        ]
        return String(bytes: bytes, encoding: .ascii) ?? "\(code)"
    }
}
