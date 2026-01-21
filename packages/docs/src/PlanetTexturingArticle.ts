import { mat4, vec3 } from 'gl-matrix';
import { WebGPURenderer } from './engine';
import { SceneManager, MeshNode, SceneNode } from './scene';
import { GeometryFactory } from './geometry';
import { InputController } from './input';
import { planetTexturingWgsl } from './shaders';

class ProceduralPlanetNode extends MeshNode {
    customPipeline: GPURenderPipeline;

    constructor(name: string, renderer: WebGPURenderer, buffer: GPUBuffer, count: number) {
        super(name, buffer, count);
        const module = renderer.device.createShaderModule({ code: planetTexturingWgsl });
        this.customPipeline = renderer.createRenderPipeline(module, 'triangle-list');
    }

    render(renderer: WebGPURenderer, pass: GPURenderPassEncoder, vp: mat4, time: number): void {
        const uboData = new Float32Array(40);
        uboData.set(vp, 0);
        uboData.set(this.transform, 16);
        uboData.set(this.color, 32);
        uboData[36] = time;
        uboData[37] = this.opacity;
        // p2 is zoom in this shader
        uboData[39] = 1.0; 

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

export class PlanetTexturingArticle {
    renderer!: WebGPURenderer;
    scene!: SceneManager;
    input = new InputController();
    canvas: HTMLCanvasElement;
    
    planet!: ProceduralPlanetNode;
    camTheta = Math.PI / 4;
    camPhi = Math.PI / 4;
    camDist = 10;
    
    running = false;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    }

    async init(renderer: WebGPURenderer) {
        this.renderer = renderer;
        this.scene = new SceneManager(this.renderer);

        const sphereData = GeometryFactory.createSphere(4, 128); // High detail for texturing
        const sphereBuf = this.renderer.createBuffer(sphereData);

        this.planet = new ProceduralPlanetNode('ProceduralPlanet', this.renderer, sphereBuf, sphereData.length / 3);
        this.scene.add(this.planet);
    }

    update(dt: number) {
        const time = Date.now() * 0.001;

        if (this.input.mouse.down) {
            this.camPhi -= this.input.mouse.dx * 0.005;
            this.camTheta -= this.input.mouse.dy * 0.005;
            this.camTheta = Math.max(0.01, Math.min(Math.PI - 0.01, this.camTheta));
        }
        this.camDist += this.input.mouse.wheel * 0.01;
        this.camDist = Math.max(4.5, Math.min(20, this.camDist));

        mat4.identity(this.planet.transform);
        mat4.rotateY(this.planet.transform, this.planet.transform, time * 0.05);

        this.scene.cameraPos[0] = this.camDist * Math.sin(this.camTheta) * Math.cos(this.camPhi);
        this.scene.cameraPos[1] = this.camDist * Math.cos(this.camTheta);
        this.scene.cameraPos[2] = this.camDist * Math.sin(this.camTheta) * Math.sin(this.camPhi);
        vec3.set(this.scene.cameraTarget, 0, 0, 0);
        vec3.set(this.scene.cameraUp, 0, 1, 0);

        this.input.resetFrame();
    }

    start() {
        this.running = true;
        const frame = () => {
            if (!this.running) return;
            this.update(0.016);
            this.scene.render(this.canvas, Date.now() * 0.001);
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    stop() {
        this.running = false;
    }
}
