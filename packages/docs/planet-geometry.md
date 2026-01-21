# Technical Monograph: Planet Geometry & Displacement

## 1. Displacement vs. Bump Mapping
While **Bump Mapping** (and Normal Mapping) provides the *illusion* of depth by perturbing how light bounces off a surface, it does not actually modify the underlying geometry. This results in "flat" silhouettes when viewed at an angle.

**Displacement Mapping** involves actual geometric transformation:
- **Vertex Shader**: The position of each vertex is pushed outward along its normal based on a heightmap or procedural function.
- **Physical Depth**: Surfaces physically rise and fall, creating accurate silhouettes, self-shadowing, and parallax effects.

### Mathematical Model
For a vertex at local position $\vec{P}$ with unit normal $\hat{n} = \frac{\vec{P}}{|\vec{P}|}$, the displaced position $\vec{P}'$ is:

$$\vec{P}' = \vec{P} + \hat{n} \cdot f(\vec{P})$$

Where $f(\vec{P})$ is our 8-octave Fractional Brownian Motion (FBM) noise.

## 2. Rendering Infinite Detail: The Nanite Approach
Modern engines like Epic Games' **Nanite** solve the "Geometric Bottleneck" (where a mesh has more triangles than there are pixels on screen) through several layers of virtualization.

### A. Meshlet Clusters
Instead of treating a model as one giant list of triangles, it is partitioned into tiny clusters called **Meshlets** (typically ~128 triangles). Each Meshlet has its own bounding sphere and visibility metadata.

### B. Hierarchical DAG (Directed Acyclic Graph)
Clusters are organized into a tree. If a patch of ground is far away, the engine renders a "Parent" cluster that looks the same but has half the triangles. If the camera gets closer, it "swaps" that parent for its higher-detail children.

### C. Software Rasterization
When triangles become smaller than a single pixel, traditional GPU hardware (the "Hardware Rasterizer") becomes inefficient. Nanite implements a custom **Compute Shader-based Rasterizer** for these sub-pixel triangles, essentially treating geometry like a "point cloud" that is filled in with extreme efficiency.

## 3. High-Frequency Normal Reconstruction
Because we displace vertices in the Vertex Shader, we must ensure the Fragment Shader's normals match the new geometry. We use **Forward Differencing** to approximate the gradient of our noise function on the fly:

```wgsl
let eps = 0.01;
let h_x = fbm((pos + vec3(eps, 0, 0)));
let h_y = fbm((pos + vec3(0, eps, 0)));
let h_z = fbm((pos + vec3(0, 0, eps)));
let slope = vec3(h - h_x, h - h_y, h - h_z);
let refinedNormal = normalize(vertexNormal + slope);
```
