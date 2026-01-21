import { mat4, vec3, quat } from 'gl-matrix';
import { WebGPURenderer } from './engine';
import { SceneManager, MeshNode, SceneNode } from './scene';
import { GeometryFactory } from './geometry';
import { InputController } from './input';
import { PlanetaryPhysics } from './physics';
import { PlanetTexturingArticle } from './PlanetTexturingArticle';
import { NaniteArticle } from './NaniteArticle';

/**
 * Custom Node for Gravity Force Vectors
 */
class ForceVectorNode extends SceneNode {
    constructor(name: string, public targetNode: SceneNode, public colorVec: number[]) {
        super(name);
        this.flat = true;
    }

    render(renderer: WebGPURenderer, pass: GPURenderPassEncoder, vp: mat4, cameraPos: vec3, time: number): void {
        const pos = vec3.fromValues(this.targetNode.transform[12], this.targetNode.transform[13], this.targetNode.transform[14]);
        const dist = vec3.length(pos);
        if (dist < 0.001) return;
        const forceMag = 18.0 / (dist * dist);
        const forceVec = new Float32Array([pos[0], pos[1], pos[2], pos[0] * (1 - forceMag), pos[1] * (1 - forceMag), pos[2] * (1 - forceMag)]);
        
        const lb = renderer.createBuffer(forceVec);
        const uboData = new Float32Array(44);
        uboData.set(vp, 0);
        uboData.set(mat4.create(), 16);
        uboData.set(this.colorVec, 32);
        uboData.set(cameraPos, 36);
        uboData[39] = time;
        uboData[40] = 1.0;
        uboData[42] = 1.0;

        const ubo = renderer.createUniformBuffer(uboData);
        const bg = renderer.device.createBindGroup({
            layout: renderer.bindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: ubo } }]
        });

        pass.setPipeline(renderer.linePipeline);
        pass.setBindGroup(0, bg);
        pass.setVertexBuffer(0, lb);
        pass.draw(2);
        pass.setPipeline(renderer.pipeline);
    }
}

class PlanetaryPhysicsArticle {
    renderer!: WebGPURenderer;
    scene!: SceneManager;
    input = new InputController();
    physics = new PlanetaryPhysics();
    
    planet!: MeshNode;
    lander!: MeshNode;
    satellite!: MeshNode;
    grid!: MeshNode;
    sun!: MeshNode;
    axis!: MeshNode;
    moon!: MeshNode;
    moonOrbit!: MeshNode;

    canvas: HTMLCanvasElement;
    isFirstPerson = false;
    camTheta = Math.PI / 4;
    camPhi = Math.PI / 4;
    camDist = 18;
    fpYaw = 0;
    fpPitch = -0.5;
    running = false;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyV' && this.running) this.isFirstPerson = !this.isFirstPerson;
        });
    }

    async init(renderer: WebGPURenderer) {
        this.renderer = renderer;
        this.scene = new SceneManager(this.renderer);

        const sphereData = GeometryFactory.createSphere(4, 48);
        const sphereBuf = this.renderer.createBuffer(sphereData);
        const dotData = GeometryFactory.createSphere(0.25, 12);
        const dotBuf = this.renderer.createBuffer(dotData);
        const pyramidData = GeometryFactory.createPyramid(0.2);
        const pyramidBuf = this.renderer.createBuffer(pyramidData);
        const gridData = GeometryFactory.createGrid(20, 20);
        const gridBuf = this.renderer.createBuffer(gridData);
        const axisData = new Float32Array([0, -5.5, 0, 0, 5.5, 0]);
        const axisBuf = this.renderer.createBuffer(axisData);

        this.grid = new MeshNode('Grid', gridBuf, gridData.length / 3, true);
        this.grid.color = [0.2, 0.2, 0.2, 0.4];
        this.grid.flat = true;
        this.scene.add(this.grid);

        this.sun = new MeshNode('Sun', sphereBuf, sphereData.length / 3);
        this.sun.color = [1, 0.9, 0.5, 1];
        this.sun.flat = true;
        mat4.translate(this.sun.transform, this.sun.transform, [100, 40, 100]);
        mat4.scale(this.sun.transform, this.sun.transform, [10, 10, 10]);
        this.scene.add(this.sun);

        this.planet = new MeshNode('Planet', sphereBuf, sphereData.length / 3);
        this.planet.color = [0, 0.8, 0.7, 1];
        this.scene.add(this.planet);

        this.axis = new MeshNode('Axis', axisBuf, 2, true);
        this.axis.color = [1, 0.1, 0.1, 1];
        this.axis.flat = true;
        this.scene.add(this.axis);

        this.satellite = new MeshNode('Satellite', dotBuf, dotData.length / 3);
        this.satellite.color = [1, 1, 0, 1];
        this.scene.add(this.satellite);

        this.lander = new MeshNode('Lander', pyramidBuf, pyramidData.length / 3);
        this.lander.color = [1, 0.5, 0, 1];
        this.scene.add(this.lander);

        this.moon = new MeshNode('Moon', sphereBuf, sphereData.length / 3);
        this.moon.color = [0.7, 0.7, 0.7, 1];
        this.scene.add(this.moon);

        const segments = 128;
        const moonA = 10.0; const moonB = 8.5;
        const orbitLines = new Float32Array(segments * 6);
        for (let i = 0; i < segments; i++) {
            const a1 = (i / segments) * Math.PI * 2; const a2 = ((i + 1) / segments) * Math.PI * 2;
            orbitLines[i*6+0] = Math.cos(a1)*moonA; orbitLines[i*6+2] = Math.sin(a1)*moonB;
            orbitLines[i*6+3] = Math.cos(a2)*moonA; orbitLines[i*6+5] = Math.sin(a2)*moonB;
        }
        const orbitBuf = this.renderer.createBuffer(orbitLines);
        this.moonOrbit = new MeshNode('MoonOrbit', orbitBuf, segments * 2, true);
        this.moonOrbit.color = [1, 1, 0, 0.5];
        this.moonOrbit.flat = true;
        this.scene.add(this.moonOrbit);

        this.scene.add(new ForceVectorNode('LanderForce', this.lander, [1, 0, 0, 1]));
        this.scene.add(new ForceVectorNode('SatForce', this.satellite, [1, 1, 0, 1]));
        this.scene.add(new ForceVectorNode('MoonForce', this.moon, [0.7, 0.7, 0.7, 1]));
    }

    update(dt: number) {
        const time = Date.now() * 0.001;
        this.physics.update(dt, {
            forward: this.input.isKeyDown('KeyW'),
            back: this.input.isKeyDown('KeyS'),
            left: this.input.isKeyDown('KeyA'),
            right: this.input.isKeyDown('KeyD')
        });

        if (this.input.mouse.down) {
            if (this.isFirstPerson) {
                this.fpYaw -= this.input.mouse.dx * 0.005;
                this.fpPitch -= this.input.mouse.dy * 0.005;
                this.fpPitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.fpPitch));
            } else {
                this.camPhi -= this.input.mouse.dx * 0.005;
                this.camTheta -= this.input.mouse.dy * 0.005;
                this.camTheta = Math.max(0.01, Math.min(Math.PI - 0.01, this.camTheta));
            }
        }
        this.camDist += this.input.mouse.wheel * 0.01;
        this.camDist = Math.max(5, Math.min(50, this.camDist));

        const planetRot = time * 0.2;
        mat4.identity(this.planet.transform);
        mat4.rotateZ(this.planet.transform, this.planet.transform, this.physics.axialTilt);
        mat4.rotateY(this.planet.transform, this.planet.transform, planetRot);
        mat4.identity(this.axis.transform);
        mat4.rotateZ(this.axis.transform, this.axis.transform, this.physics.axialTilt);
        mat4.identity(this.satellite.transform);
        mat4.rotateZ(this.satellite.transform, this.satellite.transform, this.physics.axialTilt);
        mat4.rotateY(this.satellite.transform, this.satellite.transform, planetRot);
        mat4.translate(this.satellite.transform, this.satellite.transform, [0, 0, 7]);
        mat4.multiply(this.lander.transform, this.planet.transform, this.physics.getLanderOrientation());

        const moonA = 10.0; const moonB = 8.5;
        const moonInclination = 0.26;
        const moonAngle = time * Math.sqrt(30.0 / Math.pow(moonA, 3));
        mat4.identity(this.moon.transform);
        mat4.rotateZ(this.moon.transform, this.moon.transform, moonInclination);
        mat4.translate(this.moon.transform, this.moon.transform, [Math.cos(moonAngle) * moonA, 0, Math.sin(moonAngle) * moonB]);
        mat4.rotateY(this.moon.transform, this.moon.transform, -moonAngle + Math.PI);
        mat4.scale(this.moon.transform, this.moon.transform, [0.4, 0.4, 0.4]);
        mat4.identity(this.moonOrbit.transform);
        mat4.rotateZ(this.moonOrbit.transform, this.moonOrbit.transform, moonInclination);

        if (this.isFirstPerson) {
            const eye = vec3.fromValues(this.lander.transform[12], this.lander.transform[13], this.lander.transform[14]);
            const up = vec3.fromValues(this.lander.transform[4], this.lander.transform[5], this.lander.transform[6]);
            const right = vec3.fromValues(this.lander.transform[0], this.lander.transform[1], this.lander.transform[2]);
            vec3.scaleAndAdd(eye, eye, up, 0.45);
            const pq = quat.create(); quat.setAxisAngle(pq, right, this.fpPitch);
            const yq = quat.create(); quat.setAxisAngle(yq, up, this.fpYaw);
            const combined = quat.create(); quat.multiply(combined, yq, pq);
            const viewFwd = vec3.fromValues(-this.lander.transform[8], -this.lander.transform[9], -this.lander.transform[10]);
            vec3.transformQuat(viewFwd, viewFwd, combined);
            vec3.copy(this.scene.cameraPos, eye); vec3.add(this.scene.cameraTarget, eye, viewFwd); vec3.copy(this.scene.cameraUp, up);
        } else {
            this.scene.cameraPos[0] = this.camDist * Math.sin(this.camTheta) * Math.cos(this.camPhi);
            this.scene.cameraPos[1] = this.camDist * Math.cos(this.camTheta);
            this.scene.cameraPos[2] = this.camDist * Math.sin(this.camTheta) * Math.sin(this.camPhi);
            vec3.set(this.scene.cameraTarget, 0, 0, 0); vec3.set(this.scene.cameraUp, 0, 1, 0);
        }
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
    stop() { this.running = false; }
}

async function init() {
    const renderer = await WebGPURenderer.create();
    const physicsApp = new PlanetaryPhysicsArticle('gravity-canvas');
    const texturingApp = new PlanetTexturingArticle('texture-canvas');
    const naniteApp = new NaniteArticle('nanite-canvas');
    
    await physicsApp.init(renderer);
    await texturingApp.init(renderer);
    await naniteApp.init(renderer);
    
    let currentApp: { start(): void, stop(): void } = physicsApp;
    currentApp.start();

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const article = item.getAttribute('data-article');
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            document.querySelectorAll('.article-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`${article}-article`)?.classList.add('active');
            
            currentApp.stop();
            if (article === 'physics') currentApp = physicsApp;
            else if (article === 'texturing') currentApp = texturingApp;
            else currentApp = naniteApp;
            
            currentApp.start();
        });
    });
}

init();
