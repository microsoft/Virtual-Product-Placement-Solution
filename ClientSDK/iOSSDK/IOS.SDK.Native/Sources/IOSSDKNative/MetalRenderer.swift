//
//  MetalRenderer.swift
//  IOS.SDK.Native
//
//  Re-exports `IOSSDKCore` so consumers only need `import IOSSDKNative`.
//

@_exported import IOSSDKCore
import Metal
import MetalKit
import CoreVideo
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
    private let pipelineState: MTLRenderPipelineState
    private let overlayPipelineState: MTLRenderPipelineState
    private let sampler: MTLSamplerState
    private var cachedOutput: MTLTexture?
    private var cachedWidth: Int = 0
    private var cachedHeight: Int = 0

    /// Static 4-vertex tex-coord buffer (one per overlay quad: TL/TR/BR/BL).
    private let overlayTexCoordBuffer: MTLBuffer
    /// Static 6-index buffer [0, 3, 1, 1, 3, 2] matching H5Player's winding.
    private let overlayIndexBuffer: MTLBuffer

    /// Per-slot ad timelines keyed by `OverlayElement.id`.
    /// Stills are 1-frame; GIF / APNG / animated WebP are N-frame.
    /// Populated asynchronously by `loadAdTextures(for:)`.
    private var adTimelines: [String: AdTextureTimeline] = [:]

    /// Per-slot "first visible" anchor in video PTS (seconds). Set on the
    /// draw a slot becomes visible, cleared when it disappears. The active
    /// frame is picked by `currentVideoPTS - anchor`, so seeking from
    /// outside a slot restarts its animation, while seeking inside it
    /// continues naturally.
    private var adAnchorVideoPTS: [String: TimeInterval] = [:]

    /// Per-slot uniform inputs (brightness, inner-shadow toggle). Populated
    /// synchronously by `loadAdTextures(for:)` before textures arrive.
    private var adSlotInfos: [String: AdSlotRenderInfo] = [:]

    /// Fallback texture (checkboard.png) used when a slot's image isn't loaded yet.
    private var mockAdTexture: MTLTexture?

    init?() {
        guard let device = MTLCreateSystemDefaultDevice(),
              let commandQueue = device.makeCommandQueue() else { return nil }

        self.device = device
        self.commandQueue = commandQueue

        var cache: CVMetalTextureCache?
        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &cache)
        guard let textureCache = cache else { return nil }
        self.textureCache = textureCache

        // Build video render pipeline
        let library: MTLLibrary
        do {
            library = try device.makeDefaultLibrary(bundle: .module)
        } catch {
            dlog("❌ Failed to load Metal default library from SPM bundle: \(error)")
            return nil
        }
        guard let vertexFunc = library.makeFunction(name: "vertexPassthrough"),
              let fragFunc = library.makeFunction(name: "fragmentShader")
        else { return nil }

        let pipelineDesc = MTLRenderPipelineDescriptor()
        pipelineDesc.vertexFunction = vertexFunc
        pipelineDesc.fragmentFunction = fragFunc
        pipelineDesc.colorAttachments[0].pixelFormat = .bgra8Unorm
        // 4x MSAA on the geometric edges; the MTKView's sampleCount must match.
        pipelineDesc.rasterSampleCount = 4

        guard let pipeline = try? device.makeRenderPipelineState(descriptor: pipelineDesc)
        else { return nil }
        self.pipelineState = pipeline

        // Build overlay render pipeline (perspective-correct quad with texture)
        guard let overlayVertexFunc = library.makeFunction(name: "overlayVertex"),
              let overlayFragFunc = library.makeFunction(name: "overlayFragment")
        else { return nil }

        let overlayVertexDesc = MTLVertexDescriptor()
        // attribute(0): position float4 @ offset 0
        overlayVertexDesc.attributes[0].format = .float4
        overlayVertexDesc.attributes[0].offset = 0
        overlayVertexDesc.attributes[0].bufferIndex = 0
        // attribute(1): texCoord float2 @ offset 16, from a separate buffer
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
        // Standard alpha blending so the overlay composites on top of video.
        overlayDesc.colorAttachments[0].isBlendingEnabled = true
        overlayDesc.colorAttachments[0].rgbBlendOperation = .add
        overlayDesc.colorAttachments[0].alphaBlendOperation = .add
        overlayDesc.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
        overlayDesc.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
        overlayDesc.colorAttachments[0].sourceAlphaBlendFactor = .one
        overlayDesc.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
        overlayDesc.rasterSampleCount = 4

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
                    .generateMipmaps: false,
                    .textureUsage: NSNumber(value: MTLTextureUsage.shaderRead.rawValue)
                ]
            )
            dlog("✅ Loaded mock ad texture: \(mockAdTexture?.width ?? 0)x\(mockAdTexture?.height ?? 0)")
        } catch {
            dlog("❌ Failed to load checkboard.png: \(error)")
        }
    }

    /// Register an ad-slot timeline. Must be called on the main thread
    /// (textures are read during the on-main draw pass).
    @MainActor
    func setAdTimeline(_ timeline: AdTextureTimeline, forAdIndex adIndex: String) {
        adTimelines[adIndex] = timeline
    }

    /// Clear all registered ad timelines / anchors (called on reset).
    @MainActor
    func clearAdTextures() {
        adTimelines.removeAll()
        adSlotInfos.removeAll()
        adAnchorVideoPTS.removeAll()
    }

    /// Fires on the main actor after `loadAdTextures(for:)` has attempted to
    /// download every slot's image (regardless of individual success/failure).
    /// Hooked by `MetalVideoView` so the view-model can flip its `isAdsReady`
    /// gate and allow playback to start.
    var onAdTexturesReady: (() -> Void)?

    /// Mirrors H5Player's `OverlayElementRenderer.loadAdSlots`: kicks off an
    /// async download + pad + mipmap upload for every slot in the parser,
    /// registering each resulting texture on success. When the entire batch
    /// finishes (success or failure) the `onAdTexturesReady` callback fires.
    @MainActor
    func loadAdTextures(for parser: AdManifestParser) {
        let slots = parser.allAdSlots
        guard !slots.isEmpty else {
            // Nothing to download — signal ready immediately so the gate opens.
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
                    dlog("✅ Ad timeline ready adIndex=\(slot.adIndex) frames=\(timeline.frames.count) loop=\(String(format: "%.3f", timeline.loopDuration))s base=\(base.width)x\(base.height) mips=\(base.mipmapLevelCount)")
                } else {
                    dlog("⚠️ Ad texture missing for adIndex=\(slot.adIndex), skipping overlay")
                }
            }
            dlog("🟢 All ad textures processed (\(slots.count) slot\(slots.count == 1 ? "" : "s")) — releasing playback gate")
            self?.onAdTexturesReady?()
        }
    }

    /// Zero-copy: wraps the CVPixelBuffer's IOSurface as an MTLTexture.
    func makeTexture(from pixelBuffer: CVPixelBuffer) -> MTLTexture? {
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)

        var cvTexture: CVMetalTexture?
        let status = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault,
            textureCache,
            pixelBuffer,
            nil,
            .bgra8Unorm,
            width,
            height,
            0,
            &cvTexture
        )

        guard status == kCVReturnSuccess, let cvTex = cvTexture else { return nil }
        return CVMetalTextureGetTexture(cvTex)
    }

    /// Render video + any overlays in a single pass, then present.
    /// `overlays` are in source video pixel space (top-left origin). `videoSize`
    /// is used to normalize them. `currentVideoPTS` is the seconds-based PTS
    /// of the just-decoded frame and drives the per-slot GIF animation
    /// timeline (pass `viewModel.framePTS`).
    func renderToDrawable(
        pixelBuffer: CVPixelBuffer,
        overlays: [OverlayElement] = [],
        videoSize: CGSize = .zero,
        currentVideoPTS: TimeInterval = 0,
        in view: MTKView
    ) {
        guard let inputTexture = makeTexture(from: pixelBuffer),
              let drawable = view.currentDrawable,
              let passDesc = view.currentRenderPassDescriptor,
              let commandBuffer = commandQueue.makeCommandBuffer()
        else { return }

        // Use MTKView's descriptor as-is: when sampleCount > 1 it already has
        // the MSAA texture + resolveTexture (= drawable.texture) + storeAction
        // = .multisampleResolve wired up. Overriding `texture` would defeat that.
        passDesc.colorAttachments[0].loadAction = .dontCare

        guard let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: passDesc)
        else { return }

        // Pass 1: full-screen video
        encoder.setRenderPipelineState(pipelineState)
        encoder.setFragmentTexture(inputTexture, index: 0)
        encoder.setFragmentSamplerState(sampler, index: 0)
        encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)

        // Pass 2: ad overlays. Each overlay binds its own texture frame
        // and brightness / inner-shadow uniforms.
        if !overlays.isEmpty,
           videoSize.width > 0, videoSize.height > 0 {
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
                // Skip slots whose textures aren't ready (no placeholder flash).
                guard let timeline = adTimelines[overlay.id] else { continue }
                let anchor = adAnchorVideoPTS[overlay.id] ?? currentVideoPTS
                let relT = currentVideoPTS - anchor
                let frame = timeline.frame(atRelativeTime: relT)
                encoder.setFragmentTexture(frame.texture, index: 0)

                let info = adSlotInfos[overlay.id]
                var uniforms = OverlayUniforms(
                    brightness: info?.brightness ?? 1.0,
                    enableInnerShadow: (info?.enableInnerShadow ?? false) ? 1 : 0,
                    samplesX: 16,
                    samplesY: 16
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

        commandBuffer.present(drawable)
        commandBuffer.commit()
    }
}
