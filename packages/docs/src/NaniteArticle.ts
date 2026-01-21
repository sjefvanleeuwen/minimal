import { mat4, vec3, vec4 } from 'gl-matrix';
import { WebGPURenderer } from './engine';
import { SceneManager, MeshNode } from './scene';
import { GeometryFactory } from './geometry';
import { InputController } from './input';
import { meshletWgsl } from './shaders';
import { StatsWindow, StatProperty } from './StatsWindow';

export class MeshletNode extends MeshNode {
    customPipeline: GPURenderPipeline;
    meshletId: number;
    lodBuffers: GPUBuffer[] = [];
    lodCounts: number[] = [];
    currentLod = 0;
    centroid: vec3;
    ubo: GPUBuffer;
    bindGroup: GPUBindGroup;

    constructor(name: string, renderer: WebGPURenderer, id: number, centroid: vec3) {
        super(name, null as any, 0);
        this.meshletId = id;
        this.centroid = centroid;
        const module = renderer.device.createShaderModule({ code: meshletWgsl });
        this.customPipeline = renderer.createRenderPipeline(module, 'triangle-list');
        
        // Pre-allocate UBO and BindGroup to avoid creates in render loop
        this.ubo = renderer.device.createBuffer({
            size: 176, // 44 floats * 4 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.bindGroup = renderer.device.createBindGroup({
            layout: renderer.bindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: this.ubo } }]
        });
    }

    addLod(buffer: GPUBuffer, count: number) {
        this.lodBuffers.push(buffer);
        this.lodCounts.push(count);
    }

    render(renderer: WebGPURenderer, pass: GPURenderPassEncoder, vp: mat4, cameraPos: vec3, time: number): void {
        const uboData = new Float32Array(44);
        uboData.set(vp, 0);
        uboData.set(this.transform, 16);
        uboData.set(this.color, 32);
        uboData.set(cameraPos, 36);
        uboData[39] = time;
        uboData[40] = this.meshletId;
        uboData[41] = this.currentLod;

        renderer.device.queue.writeBuffer(this.ubo, 0, uboData);

        const lodIdx = Math.floor(this.currentLod);
        pass.setPipeline(this.customPipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.lodBuffers[lodIdx]);
        pass.draw(this.lodCounts[lodIdx]);
    }
}

export class NaniteArticle {
    renderer!: WebGPURenderer;
    scene!: SceneManager;
    input = new InputController();
    canvas: HTMLCanvasElement;
    
    meshlets: MeshletNode[] = [];
    camTheta = Math.PI / 3;
    camPhi = Math.PI / 6;
    camDist = 8; // Start closer to see the transition
    running = false;
    statsWindow = new StatsWindow('Virtualization Metrics');

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.statsWindow.mount(this.canvas.parentElement!);
    }

    async init(renderer: WebGPURenderer) {
        this.renderer = renderer;
        this.scene = new SceneManager(this.renderer);

        const radius = 4;
        const subdivisions = 6; // Reduced from 8 to 6 (216 meshlets total) for better performance

        for (let face = 0; face < 6; face++) {
            for (let y = 0; y < subdivisions; y++) {
                for (let x = 0; x < subdivisions; x++) {
                    const patchSize = 2.0 / subdivisions;
                    const u = -1.0 + (x + 0.5) * patchSize;
                    const v = -1.0 + (y + 0.5) * patchSize;
                    const center = GeometryFactory.projectPoint(face, u, v, radius);
                    
                    const id = face * (subdivisions * subdivisions) + (y * subdivisions) + x;
                    const node = new MeshletNode(`Meshlet_${id}`, this.renderer, id, vec3.fromValues(center[0], center[1], center[2]));
                    
                    // 10 Levels of detail: from 48x48 down to 1x1
                    const densities = [48, 32, 24, 16, 12, 8, 6, 4, 2, 1]; 
                    for (const d of densities) {
                        const data = GeometryFactory.createPatch(face, x, y, subdivisions, radius, d);
                        node.addLod(this.renderer.createBuffer(data), data.length / 3);
                    }
                    
                    this.meshlets.push(node);
                    this.scene.add(node);
                }
            }
        }
    }

    update() {
        if (this.input.mouse.down) {
            this.camPhi -= this.input.mouse.dx * 0.005;
            this.camTheta -= this.input.mouse.dy * 0.005;
            this.camTheta = Math.max(0.01, Math.min(Math.PI - 0.01, this.camTheta));
        }
        this.camDist += this.input.mouse.wheel * 0.01;
        // Allow zooming in to 4.05 (just above surface)
        this.camDist = Math.max(4.05, Math.min(40, this.camDist));

        this.scene.cameraPos[0] = this.camDist * Math.sin(this.camTheta) * Math.cos(this.camPhi);
        this.scene.cameraPos[1] = this.camDist * Math.cos(this.camTheta);
        this.scene.cameraPos[2] = this.camDist * Math.sin(this.camTheta) * Math.sin(this.camPhi);
        vec3.set(this.scene.cameraTarget, 0, 0, 0);

        // Pre-calculate view projection for frustum culling metrics
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        mat4.perspective(this.scene.proj, Math.PI / 4, aspect, 0.1, 1000);
        mat4.lookAt(this.scene.view, this.scene.cameraPos, this.scene.cameraTarget, this.scene.cameraUp);
        mat4.multiply(this.scene.vp, this.scene.proj, this.scene.view);

        const time = Date.now() * 0.001;
        const planetRot = time * 0.1;

        // More aggressive logarithmic LOD mapping and Culling
        for (const m of this.meshlets) {
            mat4.identity(m.transform);
            mat4.rotateY(m.transform, m.transform, planetRot);
            
            const worldCentroid = vec3.transformMat4(vec3.create(), m.centroid, m.transform);
            const dist = vec3.distance(this.scene.cameraPos, worldCentroid);
            
            // Relaxed Horizon Culling: If cluster faces away from camera, hide it
            const viewDir = vec3.sub(vec3.create(), this.scene.cameraPos, worldCentroid);
            vec3.normalize(viewDir, viewDir);
            const normal = vec3.normalize(vec3.create(), worldCentroid);
            const dot = vec3.dot(viewDir, normal);
            
            // Allow significant curvature bleed (-0.5) to prevent gaps on the horizon
            m.visible = dot > -0.5;

            // Highly Relaxed Frustum Culling (NDC projection)
            if (m.visible) {
                const clipPos = vec4.fromValues(worldCentroid[0], worldCentroid[1], worldCentroid[2], 1.0);
                vec4.transformMat4(clipPos, clipPos, this.scene.vp);
                const ndcX = clipPos[0] / clipPos[3];
                const ndcY = clipPos[1] / clipPos[3];
                const ndcZ = clipPos[2] / clipPos[3];

                // Huge 4.0 margin to ensure patches intersecting the camera are never culled
                if (Math.abs(ndcX) > 4.0 || Math.abs(ndcY) > 4.0 || ndcZ > 1.2) {
                    m.visible = false;
                }
            }

            // Height above surface: planet is radius 4.0
            const height = Math.max(0, dist - 4.0);
            let lod = Math.log2(height * 20.0 + 0.1) + 3.0;
            m.currentLod = Math.max(0, Math.min(9.9, lod));
        }

        // Calculate and display Nanite-typical stats
        const totalMeshlets = this.meshlets.length;
        let visibleMeshlets = 0;
        let rasterizedVertices = 0;
        let avgLod = 0;
        let densityCounts = Array(10).fill(0);

        for (const m of this.meshlets) {
            if (!m.visible) continue;
            
            visibleMeshlets++;
            const lodIdx = Math.floor(m.currentLod);
            rasterizedVertices += m.lodCounts[lodIdx];
            avgLod += m.currentLod;
            densityCounts[lodIdx]++;
        }
        
        // Theoretical max vertices if all meshlets were at full detail
        const theoreticalFullDetail = totalMeshlets * this.meshlets[0].lodCounts[0];
        const savings = (1.0 - (rasterizedVertices / theoreticalFullDetail)) * 100;

        avgLod = visibleMeshlets > 0 ? avgLod / visibleMeshlets : 0;

        const stats: StatProperty[] = [
            { label: 'Total Meshlets', value: totalMeshlets },
            { label: 'Visible Meshlets', value: visibleMeshlets, color: '#00ffcc' },
            { label: 'Rasterized Vertices', value: rasterizedVertices.toLocaleString(), color: '#00ffcc' },
            { label: 'Geometry Savings', value: savings.toFixed(1) + '%', color: '#00ff00' },
            { label: 'Theoretical High-Res', value: theoreticalFullDetail.toLocaleString(), color: '#666' },
            { label: 'Avg LOD Level', value: avgLod.toFixed(2), color: avgLod < 4 ? '#00ff00' : '#ffcc00' }
        ];
        this.statsWindow.update(stats);

        this.input.resetFrame();
    }

    start() {
        this.running = true;
        const frame = () => {
            if (!this.running) return;
            this.update();
            this.scene.render(this.canvas, Date.now() * 0.001);
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    stop() { this.running = false; }
}
