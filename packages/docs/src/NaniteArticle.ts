import { mat4, vec3 } from 'gl-matrix';
import { WebGPURenderer } from './engine';
import { SceneManager, MeshNode } from './scene';
import { GeometryFactory } from './geometry';
import { InputController } from './input';
import { meshletWgsl } from './shaders';

class MeshletNode extends MeshNode {
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

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
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
                    const center = this.projectPoint(face, u, v, radius);
                    
                    const id = face * (subdivisions * subdivisions) + (y * subdivisions) + x;
                    const node = new MeshletNode(`Meshlet_${id}`, this.renderer, id, vec3.fromValues(center[0], center[1], center[2]));
                    
                    // 10 Levels of detail: from 48x48 down to 1x1
                    const densities = [48, 32, 24, 16, 12, 8, 6, 4, 2, 1]; 
                    for (const d of densities) {
                        const data = this.createPatch(face, x, y, subdivisions, radius, d);
                        node.addLod(this.renderer.createBuffer(data), data.length / 3);
                    }
                    
                    this.meshlets.push(node);
                    this.scene.add(node);
                }
            }
        }
    }

    private projectPoint(face: number, u: number, v: number, radius: number) {
        let x, y, z;
        if (face === 0) { x = 1; y = v; z = -u; }
        else if (face === 1) { x = -1; y = v; z = u; }
        else if (face === 2) { x = u; y = 1; z = -v; }
        else if (face === 3) { x = u; y = -1; z = v; }
        else if (face === 4) { x = u; y = v; z = 1; }
        else { x = -u; y = v; z = -1; }
        const len = Math.sqrt(x*x + y*y + z*z);
        return [x/len * radius, y/len * radius, z/len * radius];
    }

    private createPatch(face: number, px: number, py: number, res: number, radius: number, grid: number): Float32Array {
        const data: number[] = [];
        const patchSize = 2.0 / res;
        const startX = -1.0 + px * patchSize;
        const startY = -1.0 + py * patchSize;
        const gStep = patchSize / grid;

        for (let i = 0; i < grid; i++) {
            for (let j = 0; j < grid; j++) {
                const u1 = startX + i * gStep, u2 = startX + (i+1) * gStep;
                const v1 = startY + j * gStep, v2 = startY + (j+1) * gStep;
                const p1 = this.projectPoint(face, u1, v1, radius);
                const p2 = this.projectPoint(face, u2, v1, radius);
                const p3 = this.projectPoint(face, u2, v2, radius);
                const p4 = this.projectPoint(face, u1, v2, radius);
                data.push(...p1, ...p2, ...p3, ...p3, ...p4, ...p1);
            }
        }
        return new Float32Array(data);
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

        // More aggressive logarithmic LOD mapping for 10 levels
        for (const m of this.meshlets) {
            const dist = vec3.distance(this.scene.cameraPos, m.centroid);
            // Height above surface: planet is radius 4.0
            const height = Math.max(0, dist - 4.0);
            
            // Logarithmic mapping tuned for faster drop-off
            // 0 (high detail) only when very close (< 0.5 units above surface)
            // drops to 9 (lowest detail) faster
            let lod = Math.log2(height * 20.0 + 0.1) + 3.0;
            m.currentLod = Math.max(0, Math.min(9.9, lod));
        }

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
