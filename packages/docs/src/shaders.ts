export const wgsl = `
struct Uniforms {
    viewProjectionMatrix : mat4x4<f32>,
    modelMatrix : mat4x4<f32>,
    color : vec4<f32>,
    cameraPos : vec4<f32>, // xyz: camera pos, w: time
    params : vec4<f32>,    // x: opacity, y: p1, z: p2, w: p3
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) color : vec4<f32>,
    @location(1) fragPos : vec3<f32>,
    @location(2) worldNormal : vec3<f32>,
    @location(3) worldPos : vec3<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>) -> VertexOutput {
    var output : VertexOutput;
    let worldPos = uniforms.modelMatrix * vec4<f32>(position, 1.0);
    output.Position = uniforms.viewProjectionMatrix * worldPos;
    output.color = uniforms.color;
    output.fragPos = position;
    output.worldPos = worldPos.xyz;
    output.worldNormal = normalize((uniforms.modelMatrix * vec4<f32>(position, 0.0)).xyz);
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    var finalColor = input.color;
    let time = uniforms.cameraPos.w;
    let opacity = uniforms.params.x;
    let p2 = uniforms.params.z;

    if (p2 < 0.5) {
        if (opacity > 0.9) {
            let p = normalize(input.fragPos);
            let PI = 3.14159265;
            let u = 0.5 + atan2(p.z, p.x) / (2.0 * PI);
            let v = 0.5 - asin(p.y) / PI;
            let u_grid = floor(u * 48.0);
            let v_grid = floor(v * 24.0);
            let is_white = (u32(u_grid + v_grid) % 2u) == 0u;
            var base : vec3<f32>;
            if (is_white) { base = input.color.rgb; } else { base = vec3<f32>(0.02, 0.05, 0.1); }
            let sunDir = normalize(vec3<f32>(1.0, 0.4, 1.0));
            let diff = max(dot(input.worldNormal, sunDir), 0.0);
            let V = normalize(uniforms.cameraPos.xyz - input.worldPos);
            let rim = 1.0 - max(dot(input.worldNormal, V), 0.0);
            let rimLight = pow(rim, 4.0) * 0.2;
            finalColor = vec4<f32>(base * (diff + 0.05 + rimLight), 1.0);
        }
        let scanline = sin(input.fragPos.y * 20.0 + time * 2.0) * 0.03 + 0.97;
        finalColor = vec4<f32>(finalColor.rgb * scanline, finalColor.a * opacity);
    } else {
        finalColor = vec4<f32>(input.color.rgb, opacity);
    }
    return finalColor;
}
`;

export const planetTexturingWgsl = `
struct Uniforms {
    viewProjectionMatrix : mat4x4<f32>,
    modelMatrix : mat4x4<f32>,
    color : vec4<f32>,
    cameraPos : vec4<f32>, // xyz: camera pos, w: time
    params : vec4<f32>,    // x: opacity, y: zoom, z: p2, w: p3
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

fn permute(x: vec4<f32>) -> vec4<f32> { return ((x * 34.0) + 1.0) * x % 289.0; }
fn taylorInvSqrt(r: vec4<f32>) -> vec4<f32> { return 1.79284291400159 - 0.85373472095314 * r; }

fn snoise(v: vec3<f32>) -> f32 {
    let C = vec2<f32>(1.0/6.0, 1.0/3.0);
    let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);
    var i  = floor(v + dot(v, C.yyy));
    let x0 = v - i + dot(i, C.xxx);
    let g = step(x0.yzx, x0.xyz);
    let l = 1.0 - g;
    let i1 = min( g.xyz, l.zxy );
    let i2 = max( g.xyz, l.zxy );
    let x1 = x0 - i1 + C.xxx;
    let x2 = x0 - i2 + C.yyy;
    let x3 = x0 - D.yyy;
    i = i % 289.0;
    let p = permute( permute( permute( i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0 ) ) + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0 ) ) + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0 ) );
    let n_ = 0.142857142857;
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
    let norm = taylorInvSqrt(vec4<f32>(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 = p0 * norm.x; p1 = p1 * norm.y; p2 = p2 * norm.z; p3 = p3 * norm.w;
    var m = max(0.6 - vec4<f32>(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), vec4<f32>(0.0));
    m = m * m;
    return 42.0 * dot( m*m, vec4<f32>( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

fn fbm(p: vec3<f32>) -> f32 {
    var v = 0.0; var a = 0.5; var pos = p;
    for (var i = 0; i < 8; i = i + 1) {
        v = v + a * snoise(pos);
        pos = pos * 2.0; a = a * 0.5;
    }
    return v;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let p = normalize(input.localPos);
    let viewDir = normalize(uniforms.cameraPos.xyz - input.worldPos);
    let lightDir = normalize(vec3<f32>(1.0, 0.6, 1.0));
    let time = uniforms.cameraPos.w;
    
    let noiseScale = 2.5;
    let h = fbm(p * noiseScale);
    
    let eps = 0.01;
    let h_x = fbm((p + vec3<f32>(eps, 0.0, 0.0)) * noiseScale);
    let h_y = fbm((p + vec3<f32>(0.0, eps, 0.0)) * noiseScale);
    let h_z = fbm((p + vec3<f32>(0.0, 0.0, eps)) * noiseScale);
    let bumpNormal = normalize(input.normal + (vec3<f32>(h - h_x, h - h_y, h - h_z) * 0.5));
    
    var albedo : vec3<f32>;
    var specular = 0.0;
    
    if (h < 0.0) {
        albedo = mix(vec3<f32>(0.01, 0.05, 0.15), vec3<f32>(0.0, 0.25, 0.5), h + 1.0);
        specular = 0.5;
    } else if (h < 0.03) {
        albedo = vec3<f32>(0.75, 0.65, 0.45);
    } else if (h < 0.45) {
        albedo = mix(vec3<f32>(0.15, 0.35, 0.1), vec3<f32>(0.05, 0.2, 0.05), (h - 0.03) / 0.42);
    } else if (h < 0.75) {
        albedo = vec3<f32>(0.35, 0.3, 0.25);
    } else {
        albedo = vec3<f32>(0.95, 0.95, 1.0);
    }
    
    let n = mix(input.normal, bumpNormal, clamp(h, 0.0, 1.0));
    let diff = max(dot(n, lightDir), 0.0);
    let halfVec = normalize(lightDir + viewDir);
    let specStrength = pow(max(dot(n, halfVec), 0.0), 32.0) * specular;
    
    let cloudTime = time * 0.02;
    let cloudNoise = fbm(p * 3.0 + vec3<f32>(cloudTime));
    let cloudMask = smoothstep(0.1, 0.5, cloudNoise);
    
    let fres = pow(1.0 - max(dot(input.normal, viewDir), 0.0), 4.0);
    let atmosphereColor = vec3<f32>(0.3, 0.6, 1.0) * fres * 0.5;
    
    var planet = albedo * (diff + 0.1) + specStrength * vec3<f32>(1.0, 1.0, 0.9);
    planet = mix(planet, vec3<f32>(1.0, 1.0, 1.0), cloudMask * 0.7);
    
    return vec4<f32>(planet + atmosphereColor, 1.0);
}
`;

export const meshletWgsl = `
struct Uniforms {
    viewProjectionMatrix : mat4x4<f32>,
    modelMatrix : mat4x4<f32>,
    color : vec4<f32>,
    cameraPos : vec4<f32>, // xyz: camera pos, w: time
    params : vec4<f32>,    // x: meshlet_id, y: lod_level, z: p2, w: p3
};

@group(0) @binding(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) color : vec3<f32>,
    @location(1) worldNormal : vec3<f32>,
    @location(2) uv : vec2<f32>,
};

@vertex
fn vs_main(@location(0) position: vec3<f32>, @builtin(vertex_index) vIdx: u32) -> VertexOutput {
    var output : VertexOutput;
    let worldPos = uniforms.modelMatrix * vec4<f32>(position, 1.0);
    output.Position = uniforms.viewProjectionMatrix * worldPos;
    
    let id = uniforms.params.x;
    let lod = uniforms.params.y; // Continuous 0.0 to 9.0
    
    // Smooth rainbow spectrum for 10 LOD levels
    // 0: Green (High) -> 4: Orange -> 9: Purple (Low)
    var baseColor : vec3<f32>;
    if (lod < 1.0) {
        baseColor = mix(vec3<f32>(0.1, 0.9, 0.2), vec3<f32>(0.1, 0.4, 0.9), clamp(lod, 0.0, 1.0));
    } else if (lod < 3.0) {
        baseColor = mix(vec3<f32>(0.1, 0.4, 0.9), vec3<f32>(0.1, 0.9, 0.9), clamp((lod - 1.0) / 2.0, 0.0, 1.0));
    } else if (lod < 5.0) {
        baseColor = mix(vec3<f32>(0.1, 0.9, 0.9), vec3<f32>(0.9, 0.8, 0.1), clamp((lod - 3.0) / 2.0, 0.0, 1.0));
    } else if (lod < 7.0) {
        baseColor = mix(vec3<f32>(0.9, 0.8, 0.1), vec3<f32>(0.9, 0.1, 0.1), clamp((lod - 5.0) / 2.0, 0.0, 1.0));
    } else {
        baseColor = mix(vec3<f32>(0.9, 0.1, 0.1), vec3<f32>(0.5, 0.1, 0.8), clamp((lod - 7.0) / 2.0, 0.0, 1.0));
    }

    // Mix in a bit of unique per-patch grain
    let rid = fract(sin(id * 12.98) * 437.5);
    output.color = mix(baseColor, vec3<f32>(rid, rid, rid), 0.1);
    
    output.worldNormal = normalize((uniforms.modelMatrix * vec4<f32>(position, 0.0)).xyz);
    
    // UV-like coords based on vertex index for the wireframe effect
    let mod3 = vIdx % 3u;
    if (mod3 == 0u) { output.uv = vec2<f32>(1.0, 0.0); }
    else if (mod3 == 1u) { output.uv = vec2<f32>(0.0, 1.0); }
    else { output.uv = vec2<f32>(0.0, 0.0); }
    
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let diff = max(dot(input.worldNormal, lightDir), 0.3);
    
    // Wireframe effect
    let edgeWidth = 0.05;
    let bary = vec3<f32>(input.uv.x, input.uv.y, 1.0 - input.uv.x - input.uv.y);
    let isEdge = any(bary < vec3<f32>(edgeWidth));
    
    var finalColor = input.color * diff;
    if (isEdge) {
        finalColor = mix(finalColor, vec3<f32>(0.0, 0.0, 0.0), 0.5);
    }
    
    return vec4<f32>(finalColor, 1.0);
}
`;
