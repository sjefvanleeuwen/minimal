struct Uniforms {
    mvpMatrix : mat4x4<f32>,
    modelMatrix : mat4x4<f32>,
    color : vec4<f32>,
    nodeType : f32, // 0 = Box/Floor, 1 = Sphere
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
    
    if (uniforms.nodeType < 0.5) {
        // Ground / Ramp (2D World-space Checker)
        let checkSize = 1.0;
        let checks = floor(worldPos.x * checkSize + 0.001) + floor(worldPos.z * checkSize + 0.001);
        if (u32(abs(checks)) % 2u == 0u) {
            color = vec4<f32>(color.rgb * 0.9, color.a);
        } else {
            color = vec4<f32>(color.rgb * 0.7, color.a);
        }
    } else {
        // Sphere (3D Local-space Checker)
        // checkSize 2.0 = 4 chunks across the 2.0 diameter ball
        let checkSize = 2.0;
        let grid = floor(localPos.x * checkSize + 0.001) + 
                   floor(localPos.y * checkSize + 0.001) + 
                   floor(localPos.z * checkSize + 0.001);
        
        if (u32(abs(grid)) % 2u == 0u) {
            color = vec4<f32>(color.rgb * 1.0, color.a);
        } else {
            color = vec4<f32>(color.rgb * 0.8, color.a);
        }
    }

    return color;
}
