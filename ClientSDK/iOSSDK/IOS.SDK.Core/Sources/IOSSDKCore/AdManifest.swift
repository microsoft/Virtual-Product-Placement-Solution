//
//  AdManifest.swift
//  IOSSDKCore
//
//  Codable model of the server's ad-insertion manifest JSON.
//

import Foundation
import CoreGraphics
import simd

// MARK: - Root

public struct AdManifest: Codable {
    public let videoId: String
    public let publisherVideoId: String
    /// Optional so mock manifests (e.g. older snapshots) can omit them.
    public let platformId: Int?
    public let seriesId: Int?
    public let deliveryId: Int?
    public let videoMeta: VideoMeta
    public let ads: [Ad]
    public let componentConfig: ComponentConfig
    public let adInstances: AdInstances

    public enum CodingKeys: String, CodingKey {
        case videoId
        case publisherVideoId
        case platformId = "PlatformId"
        case seriesId = "SeriesId"
        case deliveryId
        case videoMeta
        case ads
        case componentConfig
        case adInstances
    }
}

// MARK: - VideoMeta

public struct VideoMeta: Codable {
    public let videoName: String
    public let videoExt: String
    public let width: Int
    public let height: Int
    /// May be fractional (e.g. 25.000508 for VFR-ish material).
    public let fps: Double
    public let nFrames: Int
    public let startPTS: Double
    public let ptsOffset: Double

    public enum CodingKeys: String, CodingKey {
        case videoName = "video_name"
        case videoExt = "video_ext"
        case width
        case height
        case fps
        case nFrames = "n_frames"
        case startPTS = "start_pts"
        case ptsOffset = "pts_offset"
    }
}

// MARK: - Ad

public struct Ad: Codable {
    /// Matches keys in `AdInstances` (string form, e.g. "0", "13").
    public let adIndex: String
    public let landingPage: String
    public let width: Int
    public let height: Int
    public let adUnitRatio: Double
    public let adUnitWidth: Int
    public let adUnitHeight: Int
    public let adUnitMaxWidth: Int
    public let adUnitMaxHeight: Int
    public let imageUrl: String
    /// Optional so mock manifests without impression IDs decode; defaulted
    /// to 0 in `AdSlot`.
    public let adId: Int?
    public let imageId: Int?
    public let adProductId: Int?
    /// Absent in Asset/32.json and the H5Player bundled fixture.
    public let adSlotId: Int?
    public let red: Double?
    public let green: Double?
    public let blue: Double?
    public let alpha: Double?
    public let brightness: Double?
    public let enableInnerShadow: Bool?
}

// MARK: - ComponentConfig

public struct ComponentConfig: Codable {
    public let enableAdDisplay: Bool
    public let enableAdClickable: Bool
    public let enableAdClosable: Bool
    public let enableVideoDialog: Bool
    public let enablePtsMap: Bool
    public let enableMaterialWrapper: Bool
    public let enableOutline: Bool
    public let enableServerSideAdsAlpha: Bool
}

// MARK: - AdInstances

public struct AdInstances: Codable {
    /// instance id -> [startFrame, endFrame]
    public let instanceStartEndFrame: [String: [Int]]
    /// instance id -> validity flag (missing == invalid)
    public let instanceValid: [String: Bool]
    /// frame -> instance id -> quad payload
    public let adUnitsInstances: [String: [String: AdUnit]]
    /// Sparse frame -> PTS (seconds).
    public let ptsTime: [String: Double]
    /// Dense per-frame PTS map covering all frames referenced above.
    public let igPtsTime: [String: Double]

    public enum CodingKeys: String, CodingKey {
        case instanceStartEndFrame = "instance_start_end_frame"
        case instanceValid = "instance_valid"
        case adUnitsInstances = "ad_units_instances"
        case ptsTime = "pts_time"
        case igPtsTime = "ig_pts_time"
    }
}

// MARK: - AdUnit (per-frame quad)

public struct AdUnit: Codable {
    /// Quad in source video pixel space: 4 points, each `[x, y]`.
    public let unit: [[Double]]

    /// 4 corners as `CGPoint`, or `nil` if the shape is wrong.
    public var points: [CGPoint]? {
        guard unit.count == 4 else { return nil }
        var out: [CGPoint] = []
        out.reserveCapacity(4)
        for p in unit {
            guard p.count >= 2 else { return nil }
            out.append(CGPoint(x: p[0], y: p[1]))
        }
        return out
    }
}

// MARK: - Loading

extension AdManifest {
    public static func decode(from data: Data) throws -> AdManifest {
        try JSONDecoder().decode(AdManifest.self, from: data)
    }

    public static func load(contentsOf url: URL) throws -> AdManifest {
        try decode(from: Data(contentsOf: url))
    }
}

// MARK: - Derived overlay model

/// 2D point in source video pixel space.
public struct Point2D: Equatable {
    public var x: Double
    public var y: Double
}

/// One ad quad on a specific frame.
public struct OverlayElement {
    /// Instance id (matches `Ad.adIndex`).
    public let id: String
    public let vertices: (Point2D, Point2D, Point2D, Point2D)
}

public enum AdMediaType {
    case image
    case gif
}

/// Renderer-ready ad description.
public struct AdSlot {
    public let adIndex: String
    public let adId: Int
    public let imageId: Int
    public let adProductId: Int
    public let adSlotId: Int?
    public let imageUrl: String
    public let landingPage: String
    public let adUnitRatio: Double
    /// Smallest frame index where this instance is visible.
    public let startFrame: Int
    /// RGBA override (0...1) or nil if any channel was missing.
    public let color: (r: Double, g: Double, b: Double, a: Double)?
    public let brightness: Double
    public let enableInnerShadow: Bool
    /// Inferred from the image URL extension.
    public let mediaType: AdMediaType
}

public struct VideoOverlayMetadata {
    public let width: Int
    public let height: Int
    /// May be fractional.
    public let fps: Double
    public let totalFrames: Int
    /// PTS (seconds) of frame 0, from `ig_pts_time["0"]`. 0 if absent.
    public let frameZeroPts: Double
}

public struct OverlayData {
    /// Frame index -> ad quads visible on that frame.
    public let elements: [Int: [OverlayElement]]
    /// adIndex -> renderer-ready ad slot.
    public let adSlots: [String: AdSlot]
    public let metadata: VideoOverlayMetadata
}

extension AdManifest {
    /// Walk `adInstances` + `ads` to produce a renderer-ready `OverlayData`.
    /// Drops instances whose `instance_valid` is not `true`. `startFrame`
    /// for each instance is derived from the observed frame map, not from
    /// `instance_start_end_frame`.
    public func buildOverlay() -> OverlayData {
        var elements: [Int: [OverlayElement]] = [:]

        for (frameStr, instMap) in adInstances.adUnitsInstances {
            guard let frame = Int(frameStr) else { continue }
            for (id, unit) in instMap {
                guard adInstances.instanceValid[id] == true else { continue }
                let q = unit.unit
                guard q.count == 4, q.allSatisfy({ $0.count >= 2 }) else { continue }
                let elem = OverlayElement(
                    id: id,
                    vertices: (
                        Point2D(x: q[0][0], y: q[0][1]),
                        Point2D(x: q[1][0], y: q[1][1]),
                        Point2D(x: q[2][0], y: q[2][1]),
                        Point2D(x: q[3][0], y: q[3][1])
                    )
                )
                elements[frame, default: []].append(elem)
            }
        }

        // startFrame: smallest frame index where each id appears.
        var startFrames: [String: Int] = [:]
        for (frame, elems) in elements {
            for e in elems {
                if let cur = startFrames[e.id] {
                    if frame < cur { startFrames[e.id] = frame }
                } else {
                    startFrames[e.id] = frame
                }
            }
        }

        var slots: [String: AdSlot] = [:]
        for ad in ads {
            let color: (r: Double, g: Double, b: Double, a: Double)?
            if let r = ad.red, let g = ad.green, let b = ad.blue {
                color = (r: r, g: g, b: b, a: ad.alpha ?? 1.0)
            } else {
                color = nil
            }

            let mediaType: AdMediaType = {
                if let u = URL(string: ad.imageUrl),
                   u.pathExtension.lowercased() == "gif" {
                    return .gif
                }
                return .image
            }()

            slots[ad.adIndex] = AdSlot(
                adIndex: ad.adIndex,
                adId: ad.adId ?? 0,
                imageId: ad.imageId ?? 0,
                adProductId: ad.adProductId ?? 0,
                adSlotId: ad.adSlotId,
                imageUrl: ad.imageUrl,
                landingPage: ad.landingPage,
                adUnitRatio: ad.adUnitRatio,
                startFrame: startFrames[ad.adIndex] ?? 0,
                color: color,
                brightness: ad.brightness ?? 1.0,
                enableInnerShadow: ad.enableInnerShadow ?? false,
                mediaType: mediaType
            )
        }

        let meta = VideoOverlayMetadata(
            width: videoMeta.width,
            height: videoMeta.height,
            fps: videoMeta.fps,
            totalFrames: videoMeta.nFrames,
            frameZeroPts: adInstances.igPtsTime["0"] ?? 0
        )

        return OverlayData(elements: elements, adSlots: slots, metadata: meta)
    }
}

// MARK: - OverlayElement geometry helpers

extension OverlayElement {
    /// Normalized vertices in video space (each component divided by the
    /// matching video dimension). Origin stays top-left.
    public func normalized(videoSize: CGSize) -> (Point2D, Point2D, Point2D, Point2D) {
        let w = videoSize.width
        let h = videoSize.height
        let v = vertices
        return (
            Point2D(x: v.0.x / w, y: v.0.y / h),
            Point2D(x: v.1.x / w, y: v.1.y / h),
            Point2D(x: v.2.x / w, y: v.2.y / h),
            Point2D(x: v.3.x / w, y: v.3.y / h)
        )
    }

    /// Four homogeneous clip-space vertices `(x·w, y·w, 0, w)` ready to be
    /// fed to a Metal vertex buffer for perspective-correct texture mapping
    /// onto an arbitrary quad.
    ///
    /// Algorithm matches H5Player's `OverlayElementRenderer.updateBufferData`
    /// (Heckbert/Wolberg homography weights):
    ///   1. Normalize to [0, 1] in video space.
    ///   2. Map to NDC: `x*2 - 1`, and flip Y (`-(y*2 - 1)`) to go from
    ///      image-space (+Y down) to Metal clip space (+Y up).
    ///   3. Solve for per-vertex w-weights `(1, 1+g, 1+g+h, 1+h)` so that
    ///      rasterizer perspective-divides into the projective quad.
    ///
    /// Returned order matches `vertices`: TL, TR, BR, BL.
    public func clipSpaceQuad(videoSize: CGSize) -> [SIMD4<Float>] {
        let n = normalized(videoSize: videoSize)
        let xs: [Double] = [n.0.x, n.1.x, n.2.x, n.3.x].map { $0 * 2 - 1 }
        let ys: [Double] = [n.0.y, n.1.y, n.2.y, n.3.y].map { -($0 * 2 - 1) }

        let dx1 = xs[1] - xs[2]
        let dy1 = ys[1] - ys[2]
        let dx2 = xs[3] - xs[2]
        let dy2 = ys[3] - ys[2]
        let sx = xs[0] - xs[1] + xs[2] - xs[3]
        let sy = ys[0] - ys[1] + ys[2] - ys[3]
        let det = dx1 * dy2 - dx2 * dy1

        let g: Double
        let h: Double
        if abs(det) < 1e-12 {
            // Degenerate (affine / collinear) — fall back to w = 1 everywhere.
            g = 0
            h = 0
        } else {
            g = (sx * dy2 - dx2 * sy) / det
            h = (dx1 * sy - sx * dy1) / det
        }

        let ws: [Double] = [1.0, 1.0 + g, 1.0 + g + h, 1.0 + h]
        return (0..<4).map { i in
            let w = ws[i]
            return SIMD4<Float>(
                Float(xs[i] * w),
                Float(ys[i] * w),
                0,
                Float(w)
            )
        }
    }
}
