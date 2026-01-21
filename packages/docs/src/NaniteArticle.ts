import { mat4, vec3 } from 'gl-matrix';
import { WebGPURenderer } from './engine';
import { SceneManager, MeshNode } from './scene';
import { GeometryFactory } from './geometry';
import { InputController } from './input';
import { meshletWgsl } from './shaders';

class MeshletNode extends MeshNode {
    customPipeline: GPURenderPipeline;
    meshletId: number;

    constructor(name: string, renderer: WebGPURenderer, buffer: GPUBuffer, count: number, id: number) {
        super(name, buffer, count);
        this.meshletId = id;
        const module = renderer.device.createShaderModule({ code: meshletWgsl });
        this.customPipeline = renderer.createRenderPipeline(module, 'triangle-list');
    }

    render(renderer: WebGPURenderer, pass: GPURenderPassEncoder, vp: mat4, cameraPos: vec3, time: number): void {
        const uboData = new Float32Array(44);
        uboData.set(vp, 0);
        uboData.set(this.transform, 16);
        uboData.set(this.color, 32);
        uboData.set(cameraPos, 36);
        uboData[39] = time;
        uboData[40] = this.meshletId;

        const ubo = renderer.createUniformBuffer(uboData);
        const bg = renderer.device.createBindGroup({
            layout: renderer.bindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: ubo } }]
        });

        pass.setPipeline(this.customPipeline);
        pass.setBindGroup(0, bg);
        pass.setVertexBuffer(0, this.buffer);
        pass.draw(this.vertexCount);
    }
}

export class NaniteArticle {
    renderer!: WebGPURenderer;
    scene!: SceneManager;
    input = new InputController();
    canvas: HTMLCanvasElement;
    
    meshlets: MeshletNode[] = [];
    camTheta = Math.PI / 4;
    camPhi = Math.PI / 4;
    camDist = 12;
    running = false;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    }

    async init(renderer: WebGPURenderer) {
        this.renderer = renderer;
        this.scene = new SceneManager(this.renderer);

        // We simulate meshlets by creating a "Planet" out of 6 cube faces, 
        // subdivided into smaller patches.
        const radius = 4;
        const subdivisions = 4; // 4x4 patches per face = 96 meshlets total

        for (let face = 0; face < 6; face++) {
            for (let y = 0; y < subdivisions; y++) {
                for (let x = 0; x < subdivisions; x++) {
                    const data = this.createPatch(face, x, y, subdivisions, radius);
                    const buf = this.renderer.createBuffer(data);
                    const id = face * (subdivisions * subdivisions) + (y * subdivisions) + x;
                    const node = new MeshletNode(`Meshlet_${id}`, this.renderer, buf, data.length / 3, id);
                    this.meshlets.push(node);
                    this.scene.add(node);
                }
            }
        }
    }

    private createPatch(face: number, px: number, py: number, res: number, radius: number): Float32Array {
        const data: number[] = [];
        const step = 2.0 / (res * 8); // Sub-grid within the patch
        const patchSize = 2.0 / res;
        const startX = -1.0 + px * patchSize;
        const startY = -1.0 + py * patchSize;

        const project = (u: number, v: number) => {
            let x, y, z;
            if (face === 0) { x = 1; y = v; z = -u; }
            else if (face === 1) { x = -1; y = v; z = u; }
            else if (face === 2) { x = u; y = 1; z = -v; }
            else if (face === 3) { x = u; y = -1; z = v; }
            else if (face === 4) { x = u; y = v; z = 1; }
            else { x = -u; y = v; z = -1; }
            const len = Math.sqrt(x*x + y*y + z*z);
            return [x/len * radius, y/len * radius, z/len * radius];
        };

        const grid = 8;
        const gStep = patchSize / grid;

        for (let i = 0; i < grid; i++) {
            for (let j = 0; j < grid; j++) {
                const u1 = startX + i * gStep, u2 = startX + (i+1) * gStep;
                const v1 = startY + j * gStep, v2 = startY + (j+1) * gStep;
                const p1 = project(u1, v1), p2 = project(u2, v1), p3 = project(u2, v2), p4 = project(u1, v2);
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

        this.scene.cameraPos[0] = this.camDist * Math.sin(this.camTheta) * Math.cos(this.camPhi);
        this.scene.cameraPos[1] = this.camDist * Math.cos(this.camTheta);
        this.scene.cameraPos[2] = this.camDist * Math.sin(this.camTheta) * Math.sin(this.camPhi);
        vec3.set(this.scene.cameraTarget, 0, 0, 0);

        // Culling simulation: simple dot product with camera
        const camNorm = vec3.normalize(vec3.create(), this.scene.cameraPos);
        for (const m of this.meshlets) {
            const pos = vec3.fromValues(m.transform[12], m.transform[13], m.transform[14]);
            // Not used in this basic transform, patches are in local space
            // In a real nanite demo we'd check meshlet centroid vs camera
            m.opacity = 1.0; 
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
