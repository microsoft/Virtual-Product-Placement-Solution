//
//  Shaders.metal
//  SimplePlayer.Native
//

#include <metal_stdlib>
using namespace metal;

// MARK: - Fullscreen Quad Vertex Shader

struct VertexOut {
    float4 position [[position]];
    float2 texCoord;
};

// Generates a fullscreen triangle strip from vertex_id (0..3), no vertex buffer needed.
vertex VertexOut vertexPassthrough(uint vid [[vertex_id]]) {
    VertexOut out;
    // Fullscreen quad via 4 vertices (triangle strip)
    float2 positions[4] = {
        float2(-1.0, -1.0),
        float2( 1.0, -1.0),
        float2(-1.0,  1.0),
        float2( 1.0,  1.0)
    };
    float2 texCoords[4] = {
        float2(0.0, 1.0),
        float2(1.0, 1.0),
        float2(0.0, 0.0),
        float2(1.0, 0.0)
    };
    out.position = float4(positions[vid], 0.0, 1.0);
    out.texCoord = texCoords[vid];
    return out;
}

// MARK: - Fragment Shader

fragment float4 fragmentShader(
    VertexOut in [[stage_in]],
    texture2d<float> inputTexture [[texture(0)]],
    sampler texSampler [[sampler(0)]])
{
    float4 color = inputTexture.sample(texSampler, in.texCoord);

    // --- Modify the pixel here ---
    // Example: grayscale (kept for reference, currently disabled)
    // float gray = dot(color.rgb, float3(0.299, 0.587, 0.114));
    // return float4(gray, gray, gray, color.a);

    return color;
}

// MARK: - Overlay (perspective-correct quad)

// Vertex format uploaded by Swift side. Position is already in homogeneous
// clip space: (x*w, y*w, 0, w). Metal divides by w in the rasterizer, which
// also gives perspective-correct interpolation of the texture coords.
struct OverlayVertexIn {
    float4 position [[attribute(0)]];
    float2 texCoord [[attribute(1)]];
};

struct OverlayVertexOut {
    float4 position [[position]];
    float2 texCoord;
};

// Per-overlay uniforms passed via setFragmentBytes (buffer slot 0).
// Layout must match `MetalRenderer.OverlayUniforms` exactly.
struct OverlayUniforms {
    float brightness;
    int   enableInnerShadow;  // 0 = off, 1 = on
    int   samplesX;
    int   samplesY;
};

vertex OverlayVertexOut overlayVertex(OverlayVertexIn in [[stage_in]]) {
    OverlayVertexOut out;
    out.position = in.position;
    out.texCoord = in.texCoord;
    return out;
}

// Port of H5Player's `fragmentShaderSourceWithSSAA`
// (Reference/H5Player/src/lib/OverlayElementRenderer.ts).
//
// The supersampling here is coverage-only: each sub-sample's tex coord is
// computed using screen-space derivatives, and we count how many of them fall
// inside [0, 1]^2. That ratio multiplies the final alpha, producing smooth
// edges where the textured quad meets its geometric boundary. The RGB itself
// is a single texture sample (which is what H5Player ends up doing too — its
// per-sample colour accumulation is commented out).
fragment float4 overlayFragment(
    OverlayVertexOut in [[stage_in]],
    constant OverlayUniforms& uniforms [[buffer(0)]],
    texture2d<float> overlayTexture [[texture(0)]],
    sampler texSampler [[sampler(0)]])
{
    float2 duvdx = dfdx(in.texCoord);
    float2 duvdy = dfdy(in.texCoord);

    int totalSamples = uniforms.samplesX * uniforms.samplesY;
    float alpha = 0.0;

    // Supersample a 4x-derivative-sized footprint around the fragment's UV.
    for (int i = 0; i < uniforms.samplesX; i++) {
        for (int j = 0; j < uniforms.samplesY; j++) {
            float2 offset = (float2(float(i), float(j)) + 0.5) /
                            float2(float(uniforms.samplesX),
                                   float(uniforms.samplesY)) - 0.5;
            offset = offset * 4.0;
            float2 sampleTexCoord = in.texCoord
                                  + offset.x * duvdx
                                  + offset.y * duvdy;
            if (sampleTexCoord.x >= 0.0 && sampleTexCoord.x <= 1.0 &&
                sampleTexCoord.y >= 0.0 && sampleTexCoord.y <= 1.0) {
                alpha += 1.0;
            }
        }
    }

    float4 finalColor = overlayTexture.sample(texSampler, in.texCoord);

    // Brightness from the manifest.
    finalColor.rgb *= uniforms.brightness;

    // Optional 10-px inner shadow at 20% opacity.
    if (uniforms.enableInnerShadow != 0) {
        float2 grad = float2(length(duvdx), length(duvdy));
        float2 dist = min(in.texCoord, 1.0 - in.texCoord);
        float2 edgeDist = dist / grad;
        const float shadowWidth   = 10.0;
        const float shadowOpacity = 0.2;
        float2 shadowFactor = 1.0 - smoothstep(0.0, shadowWidth, edgeDist);
        float shadow = max(shadowFactor.x, shadowFactor.y) * shadowOpacity;
        finalColor.rgb *= (1.0 - shadow);
    }

    // SSAA coverage multiplies the alpha.
    finalColor.a = finalColor.a * alpha / float(totalSamples);

    if (finalColor.a <= 0.0) {
        discard_fragment();
    }
    return finalColor;
}
