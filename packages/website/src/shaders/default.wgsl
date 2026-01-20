struct Uniforms {
    mvpMatrix : mat4x4<f32>,
    modelMatrix : mat4x4<f32>,
    color : vec4<f32>,
};

@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) fragColor : vec4<f32>,
    @location(1) worldPos : vec3<f32>,
    @location(2) localPos : vec3<f32>,
};

@vertex
fn vs_main(@location(0) position : vec4<f32>, @location(1) localPos : vec3<f32>) -> VertexOutput {
    var output : VertexOutput;
    output.Position = uniforms.mvpMatrix * position;
    output.fragColor = uniforms.color;
    
    // Transform local vertex position to world space
    let worldPos4 = uniforms.modelMatrix * position;
    output.worldPos = worldPos4.xyz;
    output.localPos = localPos;
    return output;
}

@fragment
fn fs_main(@location(0) fragColor : vec4<f32>, @location(1) worldPos : vec3<f32>, @location(2) localPos : vec3<f32>) -> @location(0) vec4<f32> {
    var color = fragColor;
    
    // Check if we are on a "floor" surface (GroundNode at y=0 or Ramp/Plateau top at y=0.5)
    let isFloor = abs(localPos.y) < 0.001 || localPos.y > 0.49;
    
    if (isFloor) {
        // Use worldPos for the checkerboard so patterns align across objects
        let checkSize = 1.0;
        let checks = floor(worldPos.x * checkSize + 0.001) + floor(worldPos.z * checkSize + 0.001);
        if (u32(abs(checks)) % 2u == 0u) {
            color = vec4<f32>(color.rgb * 0.9, color.a);
        } else {
            color = vec4<f32>(color.rgb * 0.7, color.a);
        }
    } else {
        let pi = 3.14159265359;
        let normalizedPos = normalize(localPos);
        let u = 0.5 + atan2(normalizedPos.z, normalizedPos.x) / (2.0 * pi);
        let v = 0.5 - asin(normalizedPos.y) / pi;
        
        let checkSize = 8.0;
        let checks = floor(u * checkSize) + floor(v * checkSize);
        if (u32(abs(checks)) % 2u == 0u) {
            color = vec4<f32>(color.rgb * 1.0, color.a);
        } else {
            color = vec4<f32>(color.rgb * 0.8, color.a);
        }
    }

    return color;
}
