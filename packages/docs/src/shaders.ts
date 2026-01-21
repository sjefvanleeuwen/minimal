export const wgsl = `
struct Uniforms {
    viewProjectionMatrix : mat4x4<f32>,
    modelMatrix : mat4x4<f32>,
    color : vec4<f32>,
    time : f32,
    opacity : f32,
    p1 : f32,
    p2 : f32,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) color : vec4<f32>,
    @location(1) fragPos : vec3<f32>,
    @location(2) worldNormal : vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> VertexOutput {
    var output : VertexOutput;
    let worldPos = uniforms.modelMatrix * vec4<f32>(position, 1.0);
    output.Position = uniforms.viewProjectionMatrix * worldPos;
    output.color = uniforms.color;
    output.fragPos = position;
    
    // Transform normal to world space (simple version for non-uniform scale)
    output.worldNormal = normalize((uniforms.modelMatrix * vec4<f32>(position, 0.0)).xyz);
    
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    var finalColor = input.color;
    
    // p2 > 0.5 means FLAT mode (no shading, no lighting)
    if (uniforms.p2 < 0.5) {
        if (uniforms.opacity > 0.9) {
            // High Contrast Spherical Checkerboard
            let p = normalize(input.fragPos);
            let PI = 3.14159265;
            let u = 0.5 + atan2(p.z, p.x) / (2.0 * PI);
            let v = 0.5 - asin(p.y) / PI;
            
            // Higher density for surface visibility
            let u_grid = floor(u * 48.0);
            let v_grid = floor(v * 24.0);
            let is_white = (u32(u_grid + v_grid) % 2u) == 0u;
            
            var base : vec3<f32>;
            if (is_white) {
                base = input.color.rgb;
            } else {
                base = vec3<f32>(0.02, 0.05, 0.1);
            }
            
            // Lighting (Sun from a "Fixed" position in space)
            let sunDir = normalize(vec3<f32>(1.0, 0.4, 1.0)); // Far away Sun
            
            // Diffuse component
            let diff = max(dot(input.worldNormal, sunDir), 0.0);
            
            // Subtle rim light / atmosphere effect
            let V = normalize(-input.fragPos); // View dir (approx)
            let rim = 1.0 - max(dot(input.worldNormal, V), 0.0);
            let rimLight = pow(rim, 4.0) * 0.2;
            
            finalColor = vec4<f32>(base * (diff + 0.05 + rimLight), 1.0); // 0.05 ambient floor
        }
        
        // Scanline effect only for shaded objects
        let scanline = sin(input.fragPos.y * 20.0 + uniforms.time * 2.0) * 0.03 + 0.97;
        finalColor = vec4<f32>(finalColor.rgb * scanline, finalColor.a * uniforms.opacity);
    } else {
        // Flat mode: Bypass all lighting
        finalColor = vec4<f32>(input.color.rgb, uniforms.opacity);
    }

    return finalColor;
}
`;
