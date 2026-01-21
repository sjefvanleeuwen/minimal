import { mat4, vec3, quat } from 'gl-matrix';
import { WebGPURenderer } from './engine';

export abstract class SceneNode {
    transform = mat4.create();
    color = [1, 1, 1, 1];
    opacity = 1.0;
    flat = false;
    visible = true;

    constructor(public name: string) {}

    abstract render(renderer: WebGPURenderer, pass: GPURenderPassEncoder, vp: mat4, cameraPos: vec3, time: number): void;
    
    update(dt: number) {}
}

export class MeshNode extends SceneNode {
    constructor(
        name: string,
        public buffer: GPUBuffer,
        public vertexCount: number,
        public isLines = false
    ) {
        super(name);
    }

    render(renderer: WebGPURenderer, pass: GPURenderPassEncoder, vp: mat4, cameraPos: vec3, time: number): void {
        if (!this.visible) return;

        const uboData = new Float32Array(44);
        uboData.set(vp, 0);
        uboData.set(this.transform, 16);
        uboData.set(this.color, 32);
        uboData.set(cameraPos, 36);
        uboData[39] = time;
        uboData[40] = this.opacity;
        uboData[42] = this.flat ? 1.0 : 0.0;

        const ubo = renderer.createUniformBuffer(uboData);
        const bg = renderer.device.createBindGroup({
            layout: renderer.bindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: ubo } }]
        });

        pass.setPipeline(this.isLines ? renderer.linePipeline : renderer.pipeline);
        pass.setBindGroup(0, bg);
        pass.setVertexBuffer(0, this.buffer);
        pass.draw(this.vertexCount);
    }
}

export class SceneManager {
    nodes: SceneNode[] = [];
    view = mat4.create();
    proj = mat4.create();
    vp = mat4.create();
    cameraPos = vec3.fromValues(0, 0, 15);
    cameraTarget = vec3.fromValues(0, 0, 0);
    cameraUp = vec3.fromValues(0, 1, 0);

    constructor(public renderer: WebGPURenderer) {}

    add(node: SceneNode) {
        this.nodes.push(node);
    }

    update(dt: number) {
        for (const node of this.nodes) {
            node.update(dt);
        }
    }

    render(canvas: HTMLCanvasElement, time: number) {
        const aspect = canvas.clientWidth / canvas.clientHeight;
        mat4.perspective(this.proj, Math.PI / 4, aspect, 0.1, 1000);
        mat4.lookAt(this.view, this.cameraPos, this.cameraTarget, this.cameraUp);
        mat4.multiply(this.vp, this.proj, this.view);

        this.renderer.render(canvas, (pass) => {
            for (const node of this.nodes) {
                node.render(this.renderer, pass, this.vp, this.cameraPos, time);
            }
        });
    }
}
