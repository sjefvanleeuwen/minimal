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

export const planetTexturingWgsl = `
struct Uniforms {
    viewProjectionMatrix : mat4x4<f32>,
    modelMatrix : mat4x4<f32>,
    color : vec4<f32>,
    time : f32,
    opacity : f32,
    zoom : f32,
    p2 : f32,
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) worldPos : vec3<f32>,
    @location(1) localPos : vec3<f32>,
    @location(2) normal : vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> VertexOutput {
    var output : VertexOutput;
    let worldPos = uniforms.modelMatrix * vec4<f32>(position, 1.0);
    output.Position = uniforms.viewProjectionMatrix * worldPos;
    output.worldPos = worldPos.xyz;
    output.localPos = position;
    output.normal = normalize((uniforms.modelMatrix * vec4<f32>(position, 0.0)).xyz);
    return output;
}

// Simplex 3D Noise from https://github.com/stegu/psrdnoise
fn permute(x: vec4<f32>) -> vec4<f32> { return ((x * 34.0) + 1.0) * x % 289.0; }
fn taylorInvSqrt(r: vec4<f32>) -> vec4<f32> { return 1.79284291400159 - 0.85373472095314 * r; }

fn snoise(v: vec3<f32>) -> f32 {
    let C = vec2<f32>(1.0/6.0, 1.0/3.0);
    let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);

    // First corner
    var i  = floor(v + dot(v, C.yyy));
    let x0 = v - i + dot(i, C.xxx);

    // Other corners
    let g = step(x0.yzx, x0.xyz);
    let l = 1.0 - g;
    let i1 = min( g.xyz, l.zxy );
    let i2 = max( g.xyz, l.zxy );

    let x1 = x0 - i1 + C.xxx;
    let x2 = x0 - i2 + C.yyy;
    let x3 = x0 - D.yyy;

    // Permutations
    i = i % 289.0;
    let p = permute( permute( permute( i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0 ) ) + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0 ) ) + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0 ) );

    // Gradients
    let n_ = 0.142857142857; // 1.0/7.0
    let ns = n_ * D.wyz - D.xzx;

    let j = p - 49.0 * floor(p * ns.z * ns.z);

    let x_ = floor(j * ns.z);
    let y_ = floor(j - 7.0 * x_);

    let x = x_ *ns.x + ns.y;
    let y = y_ *ns.x + ns.y;
    let h = 1.0 - abs(x) - abs(y);

    let b0 = vec4<f32>( x.xy, y.xy );
    let b1 = vec4<f32>( x.zw, y.zw );

    let s0 = floor(b0)*2.0 + 1.0;
    let s1 = floor(b1)*2.0 + 1.0;
    let sh = -step(h, vec4<f32>(0.0));

    let a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    let a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    var p0 = vec3<f32>(a0.xy, h.x);
    var p1 = vec3<f32>(a0.zw, h.y);
    var p2 = vec3<f32>(a1.xy, h.z);
    var p3 = vec3<f32>(a1.zw, h.w);

    // Normalise gradients
    let norm = taylorInvSqrt(vec4<f32>(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 = p0 * norm.x;
    p1 = p1 * norm.y;
    p2 = p2 * norm.z;
    p3 = p3 * norm.w;

    // Mix final noise value
    var m = max(0.6 - vec4<f32>(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), vec4<f32>(0.0));
    m = m * m;
    return 42.0 * dot( m*m, vec4<f32>( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

fn fbm(p: vec3<f32>) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var pos = p;
    for (var i = 0; i < 8; i = i + 1) {
        v = v + a * snoise(pos);
        pos = pos * 2.0;
        a = a * 0.5;
    }
    return v;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let p = normalize(input.localPos);
    
    // Scale position by zoom to show detail
    let noisePos = p * 2.0; 
    let h = fbm(noisePos);
    
    // Derived elevation mapping
    var color : vec3<f32>;
    
    if (h < 0.0) {
        // Water
        color = mix(vec3<f32>(0.0, 0.1, 0.4), vec3<f32>(0.0, 0.2, 0.6), h + 1.0);
    } else if (h < 0.05) {
        // Sand
        color = vec3<f32>(0.8, 0.7, 0.5);
    } else if (h < 0.4) {
        // Grass/Forest
        color = mix(vec3<f32>(0.1, 0.4, 0.1), vec3<f32>(0.05, 0.2, 0.05), (h - 0.05) / 0.35);
    } else if (h < 0.7) {
        // Rock
        color = vec3<f32>(0.4, 0.3, 0.3);
    } else {
        // Snow
        color = vec3<f32>(0.9, 0.9, 1.0);
    }
    
    // Add some lighting
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let diff = max(dot(input.normal, lightDir), 0.2);
    
    // Zoom dependent detail
    let detail = fbm(p * 50.0) * 0.05;
    
    return vec4<f32>(color * diff + detail, 1.0);
}
`;
