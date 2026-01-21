import { mat4, vec3, quat } from 'gl-matrix';
import { wgsl } from './shaders';

class MiniRenderer {
    device: GPUDevice;
    pipeline: GPURenderPipeline;
    linePipeline: GPURenderPipeline;
    bindGroupLayout: GPUBindGroupLayout;
    depthTexture: GPUTexture | null = null;
    
    constructor(device: GPUDevice, pipeline: GPURenderPipeline, linePipeline: GPURenderPipeline, bindGroupLayout: GPUBindGroupLayout) {
        this.device = device;
        this.pipeline = pipeline;
        this.linePipeline = linePipeline;
        this.bindGroupLayout = bindGroupLayout;
    }

    static async create() {
        if (!navigator.gpu) throw new Error("WebGPU not supported");
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No adapter");
        const device = await adapter.requestDevice();
        
        const module = device.createShaderModule({ label: 'Main Shader Module', code: wgsl });
        
        const bindGroupLayout = device.createBindGroupLayout({
            label: 'Main Bind Group Layout',
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }]
        });

        const pipelineLayout = device.createPipelineLayout({
            label: 'Main Pipeline Layout',
            bindGroupLayouts: [bindGroupLayout]
        });

        const pipeline = device.createRenderPipeline({
            label: 'Main Render Pipeline',
            layout: pipelineLayout,
            vertex: {
                module,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 12,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
                }]
            },
            fragment: {
                module,
                entryPoint: 'fs_main',
                targets: [{ 
                    format: navigator.gpu.getPreferredCanvasFormat(),
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
                    }
                }]
            },
            primitive: { 
                topology: 'triangle-list',
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
        });

        const linePipeline = device.createRenderPipeline({
            label: 'Line Render Pipeline',
            layout: pipelineLayout,
            vertex: {
                module,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 12,
                    attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
                }]
            },
            fragment: {
                module,
                entryPoint: 'fs_main',
                targets: [{ 
                    format: navigator.gpu.getPreferredCanvasFormat(),
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
                    }
                }]
            },
            primitive: { 
                topology: 'line-list',
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
        });

        return new MiniRenderer(device, pipeline, linePipeline, bindGroupLayout);
    }

    render(canvas: HTMLCanvasElement, drawFn: (ctx: GPUCommandEncoder, pass: GPURenderPassEncoder) => void) {
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            if (this.depthTexture) {
                this.depthTexture.destroy();
                this.depthTexture = null;
            }
        }

        const context = canvas.getContext('webgpu')!;
        // Only configure if not already configured for this canvas (simplified)
        context.configure({
            device: this.device,
            format: navigator.gpu.getPreferredCanvasFormat(),
            alphaMode: 'premultiplied',
        });

        if (!this.depthTexture) {
            this.depthTexture = this.device.createTexture({
                label: 'Main Depth Texture',
                size: [canvas.width || 1, canvas.height || 1],
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
        }

        const commandEncoder = this.device.createCommandEncoder({ label: 'Main Command Encoder' });
        const renderPass = commandEncoder.beginRenderPass({
            label: 'Main Render Pass',
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                clearValue: { r: 0.05, g: 0.07, b: 0.1, a: 1 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            }
        });

        renderPass.setPipeline(this.pipeline);
        drawFn(commandEncoder, renderPass);
        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }
}

// Helpers for geometry
function createSphereTriangles(radius: number, segments: number): Float32Array {
    const data: number[] = [];
    for (let j = 0; j < segments; j++) {
        const theta1 = (j / segments) * Math.PI;
        const theta2 = ((j + 1) / segments) * Math.PI;
        for (let i = 0; i < segments; i++) {
            const phi1 = (i / segments) * Math.PI * 2;
            const phi2 = ((i + 1) / segments) * Math.PI * 2;

            const x1 = radius * Math.sin(theta1) * Math.cos(phi1);
            const y1 = radius * Math.cos(theta1);
            const z1 = radius * Math.sin(theta1) * Math.sin(phi1);

            const x2 = radius * Math.sin(theta1) * Math.cos(phi2);
            const y2 = radius * Math.cos(theta1);
            const z2 = radius * Math.sin(theta1) * Math.sin(phi2);

            const x3 = radius * Math.sin(theta2) * Math.cos(phi1);
            const y3 = radius * Math.cos(theta2);
            const z3 = radius * Math.sin(theta2) * Math.sin(phi1);

            const x4 = radius * Math.sin(theta2) * Math.cos(phi2);
            const y4 = radius * Math.cos(theta2);
            const z4 = radius * Math.sin(theta2) * Math.sin(phi2);

            // Correct winding for counter-clockwise
            data.push(x1, y1, z1, x3, y3, z3, x2, y2, z2);
            data.push(x2, y2, z2, x3, y3, z3, x4, y4, z4);
        }
    }
    return new Float32Array(data);
}

function createPyramid(size: number): Float32Array {
    const s = size;
    const h = size * 2;
    return new Float32Array([
        // Bottom
        -s, 0, -s,  s, 0, -s,  s, 0, s,
        -s, 0, -s,  s, 0, s,  -s, 0, s,
        // Sides
        0, h, 0,  -s, 0, -s,   s, 0, -s,
        0, h, 0,   s, 0, -s,   s, 0, s,
        0, h, 0,   s, 0, s,   -s, 0, s,
        0, h, 0,  -s, 0, s,   -s, 0, -s,
    ]);
}

function createGridLines(size: number, div: number): Float32Array {
    const data: number[] = [];
    for (let i = -div; i <= div; i++) {
        const p = (i / div) * size;
        // X Lines
        data.push(-size, 0, p, size, 0, p);
        // Z Lines
        data.push(p, 0, -size, p, 0, size);
    }
    return new Float32Array(data);
}

const keys: Record<string, boolean> = {};
let isFirstPerson = false;

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyV') isFirstPerson = !isFirstPerson;
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

let landerLocalPhi = 0;
let landerLocalTheta = Math.PI / 2;
let landerDirectionFlipped = false;

let fpYaw = 0;
let fpPitch = -0.5; // Look down 30 degrees to see the surface

let camTheta = Math.PI / 4;
let camPhi = Math.PI / 4;
let camDist = 18;
let isMouseDragging = false;

window.addEventListener('mousedown', () => isMouseDragging = true);
window.addEventListener('mouseup', () => isMouseDragging = false);
window.addEventListener('mousemove', (e) => {
    if (isMouseDragging) {
        if (isFirstPerson) {
            fpYaw -= e.movementX * 0.005;
            fpPitch -= e.movementY * 0.005;
            fpPitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, fpPitch));
        } else {
            camPhi -= e.movementX * 0.005;
            camTheta -= e.movementY * 0.005;
            // Limit camera to avoid going exactly to poles (singularity in mat4.lookAt)
            camTheta = Math.max(0.01, Math.min(Math.PI - 0.01, camTheta));
        }
    }
});
window.addEventListener('wheel', (e) => {
    camDist += e.deltaY * 0.01;
    camDist = Math.max(5, Math.min(50, camDist));
});

async function init() {
    const renderer = await MiniRenderer.create();
    const sphereData = createSphereTriangles(4, 48); // Increased radius from 2 to 4, higher detail
    const sphereBuffer = renderer.device.createBuffer({
        size: sphereData.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true
    });
    new Float32Array(sphereBuffer.getMappedRange()).set(sphereData);
    sphereBuffer.unmap();

    const dotData = createSphereTriangles(0.25, 12); // Slightly larger dots for the bigger sphere
    const dotBuffer = renderer.device.createBuffer({
        size: dotData.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true
    });
    new Float32Array(dotBuffer.getMappedRange()).set(dotData);
    dotBuffer.unmap();

    const gridData = createGridLines(20, 20); // Larger grid
    const gridBuffer = renderer.device.createBuffer({ size: gridData.byteLength, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
    new Float32Array(gridBuffer.getMappedRange()).set(gridData);
    gridBuffer.unmap();

    const landerData = createPyramid(0.2); // Larger visible lander
    const landerBuffer = renderer.device.createBuffer({ size: landerData.byteLength, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
    new Float32Array(landerBuffer.getMappedRange()).set(landerData);
    landerBuffer.unmap();

    const canvas = document.getElementById('gravity-canvas') as HTMLCanvasElement;

    function frame() {
        const time = Date.now() * 0.001;
        const axialTilt = 0.41; 
        
        // Update lander position based on input
        const speed = 0.05;
        const currentSpeed = landerDirectionFlipped ? -speed : speed;

        if (keys['KeyW']) landerLocalTheta += currentSpeed;
        if (keys['KeyS']) landerLocalTheta -= currentSpeed;
        if (keys['KeyA']) landerLocalPhi += speed;
        if (keys['KeyD']) landerLocalPhi -= speed;

        /** 
         * Pole-crossing logic: 
         * When moving North/South across a pole, the latitude reflects 
         * and the longitude flips by 180 degrees (+PI).
         * We also flip the landerDirectionFlipped flag so holding the same key
         * continues the motion away from the pole.
         */
        if (landerLocalTheta < 0) {
            landerLocalTheta = -landerLocalTheta; 
            landerLocalPhi += Math.PI;
            landerDirectionFlipped = !landerDirectionFlipped;
        } else if (landerLocalTheta > Math.PI) {
            landerLocalTheta = 2 * Math.PI - landerLocalTheta; 
            landerLocalPhi += Math.PI;
            landerDirectionFlipped = !landerDirectionFlipped;
        }
        
        // Normalize longitude
        landerLocalPhi = ((landerLocalPhi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

        // Pre-calculate Lander and Planet Matrices
        const planetRot = time * 0.2;
        const planetModel = mat4.create();
        mat4.rotateZ(planetModel, planetModel, axialTilt);
        mat4.rotateY(planetModel, planetModel, planetRot);

        const landerModel = mat4.create();
        const lr = 4.0; 
        const lx = lr * Math.sin(landerLocalTheta) * Math.cos(landerLocalPhi);
        const ly = lr * Math.cos(landerLocalTheta);
        const lz = lr * Math.sin(landerLocalTheta) * Math.sin(landerLocalPhi);
        
        // Use a stable Up/Forward frame to avoid lookAt singularities
        const lUp = vec3.fromValues(lx, ly, lz);
        vec3.normalize(lUp, lUp);
        const lFwd = vec3.fromValues(
            Math.cos(landerLocalTheta) * Math.cos(landerLocalPhi),
            -Math.sin(landerLocalTheta),
            Math.cos(landerLocalTheta) * Math.sin(landerLocalPhi)
        );
        vec3.normalize(lFwd, lFwd);
        const lRight = vec3.create();
        vec3.cross(lRight, lUp, lFwd);
        
        const localOrient = mat4.create();
        localOrient[0]=lRight[0]; localOrient[1]=lRight[1]; localOrient[2]=lRight[2];
        localOrient[4]=lUp[0];    localOrient[5]=lUp[1];    localOrient[6]=lUp[2];
        localOrient[8]=-lFwd[0];  localOrient[9]=-lFwd[1];  localOrient[10]=-lFwd[2];
        localOrient[12]=lx;       localOrient[13]=ly;       localOrient[14]=lz;

        mat4.multiply(landerModel, planetModel, localOrient);

        renderer.render(canvas, (encoder, pass) => {
            const aspect = canvas.clientWidth / canvas.clientHeight;
            const proj = mat4.create();
            mat4.perspective(proj, Math.PI / 4, aspect, 0.01, 100); // Smaller near plane for surface view
            
            const view = mat4.create();
            if (isFirstPerson) {
                // Eye is at lander world position, Up is its world normal
                const eye = vec3.fromValues(landerModel[12], landerModel[13], landerModel[14]);
                const up = vec3.fromValues(landerModel[4], landerModel[5], landerModel[6]);
                const fwd = vec3.fromValues(-landerModel[8], -landerModel[9], -landerModel[10]);
                const right = vec3.fromValues(landerModel[0], landerModel[1], landerModel[2]);
                
                // Lift camera slightly above the lander pyramid (size 0.2, height 0.4)
                vec3.scaleAndAdd(eye, eye, up, 0.45);
                
                // Construct rotated target based on fpYaw and fpPitch
                const pitchQuat = quat.create();
                quat.setAxisAngle(pitchQuat, right, fpPitch);
                const yawQuat = quat.create();
                quat.setAxisAngle(yawQuat, up, fpYaw);
                
                const combined = quat.create();
                quat.multiply(combined, yawQuat, pitchQuat);
                
                const viewFwd = vec3.fromValues(-landerModel[8], -landerModel[9], -landerModel[10]);
                vec3.transformQuat(viewFwd, viewFwd, combined);
                
                const target = vec3.create();
                vec3.scaleAndAdd(target, eye, viewFwd, 5.0);
                mat4.lookAt(view, eye, target, up);
            } else {
                const cx = camDist * Math.sin(camTheta) * Math.cos(camPhi);
                const cy = camDist * Math.cos(camTheta);
                const cz = camDist * Math.sin(camTheta) * Math.sin(camPhi);
                mat4.lookAt(view, [cx, cy, cz], [0, 0, 0], [0, 1, 0]); 
            }
            
            const vp = mat4.create();
            mat4.multiply(vp, proj, view);

            // 1. Draw Background Grid
            const gridUniforms = new Float32Array(40); 
            gridUniforms.set(vp, 0);
            gridUniforms.set(mat4.create(), 16);
            gridUniforms.set([0.2, 0.2, 0.2, 0.4], 32); 
            gridUniforms[36] = time;
            gridUniforms[37] = 0.4;
            gridUniforms[39] = 1.0; 

            const gridUbo = renderer.device.createBuffer({
                size: gridUniforms.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            renderer.device.queue.writeBuffer(gridUbo, 0, gridUniforms);
            const gridBG = renderer.device.createBindGroup({
                layout: renderer.bindGroupLayout,
                entries: [{ binding: 0, resource: { buffer: gridUbo } }]
            });
            pass.setPipeline(renderer.linePipeline);
            pass.setBindGroup(0, gridBG);
            pass.setVertexBuffer(0, gridBuffer);
            pass.draw(gridData.length / 3);
            pass.setPipeline(renderer.pipeline);

            // 1.5. Draw distant Sun
            const sunModel = mat4.create();
            mat4.translate(sunModel, sunModel, [100, 40, 100]); 
            mat4.scale(sunModel, sunModel, [10, 10, 10]);
            const sunUniforms = new Float32Array(40);
            sunUniforms.set(vp, 0); 
            sunUniforms.set(sunModel, 16); 
            sunUniforms.set([1, 0.9, 0.5, 1], 32); 
            sunUniforms[37] = 1.0; 
            sunUniforms[39] = 1.0; 
            const sunUbo = renderer.device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            renderer.device.queue.writeBuffer(sunUbo, 0, sunUniforms);
            const sunBG = renderer.device.createBindGroup({ layout: renderer.bindGroupLayout, entries: [{ binding: 0, resource: { buffer: sunUbo } }] });
            pass.setBindGroup(0, sunBG);
            pass.setVertexBuffer(0, sphereBuffer);
            pass.draw(sphereData.length / 3);

            // 2. Draw Tilted Planet
            const planetUniforms = new Float32Array(40);
            planetUniforms.set(vp, 0);
            planetUniforms.set(planetModel, 16);
            planetUniforms.set([0, 0.8, 0.7, 1], 32); 
            planetUniforms[36] = time;
            planetUniforms[37] = 1.0;

            const ubo = renderer.device.createBuffer({
                size: planetUniforms.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            renderer.device.queue.writeBuffer(ubo, 0, planetUniforms);
            const bindGroup = renderer.device.createBindGroup({
                layout: renderer.bindGroupLayout,
                entries: [{ binding: 0, resource: { buffer: ubo } }]
            });
            pass.setBindGroup(0, bindGroup);
            pass.setVertexBuffer(0, sphereBuffer);
            pass.draw(sphereData.length / 3);

            // 3. Draw Axis
            const axisLen = 5.5;
            const axisPoints = new Float32Array([0, -axisLen, 0, 0, axisLen, 0]);
            const axisBuf = renderer.device.createBuffer({ size: axisPoints.byteLength, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
            new Float32Array(axisBuf.getMappedRange()).set(axisPoints);
            axisBuf.unmap();
            const axisModel = mat4.create();
            mat4.rotateZ(axisModel, axisModel, axialTilt);
            const axisUboData = new Float32Array(40);
            axisUboData.set(vp, 0);
            axisUboData.set(axisModel, 16);
            axisUboData.set([1, 0.1, 0.1, 1], 32); 
            axisUboData[37] = 1.0; 
            axisUboData[39] = 1.0; 
            const uboA = renderer.device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            renderer.device.queue.writeBuffer(uboA, 0, axisUboData);
            const bgA = renderer.device.createBindGroup({ layout: renderer.bindGroupLayout, entries: [{ binding: 0, resource: { buffer: uboA } }] });
            pass.setPipeline(renderer.linePipeline);
            pass.setBindGroup(0, bgA);
            pass.setVertexBuffer(0, axisBuf);
            pass.draw(2);
            pass.setPipeline(renderer.pipeline);

            // 4. Geostationary Satellite
            const satModel = mat4.create();
            mat4.rotateZ(satModel, satModel, axialTilt);
            mat4.rotateY(satModel, satModel, planetRot);
            mat4.translate(satModel, satModel, [0, 0, 7.0]);
            const satUniforms = new Float32Array(40);
            satUniforms.set(vp, 0);
            satUniforms.set(satModel, 16);
            satUniforms.set([1, 1, 0, 1], 32); 
            satUniforms[36] = time;
            satUniforms[37] = 1.0;
            const uboSat = renderer.device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            renderer.device.queue.writeBuffer(uboSat, 0, satUniforms);
            const bgSat = renderer.device.createBindGroup({ layout: renderer.bindGroupLayout, entries: [{ binding: 0, resource: { buffer: uboSat } }] });
            pass.setBindGroup(0, bgSat);
            pass.setVertexBuffer(0, dotBuffer);
            pass.draw(dotData.length / 3);

            // 5. Surface Lander
            const landerUniforms = new Float32Array(40);
            landerUniforms.set(vp, 0);
            landerUniforms.set(landerModel, 16);
            landerUniforms.set([1, 0.5, 0, 1], 32); 
            landerUniforms[36] = time;
            landerUniforms[37] = 1.0;
            const uboLander = renderer.device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            renderer.device.queue.writeBuffer(uboLander, 0, landerUniforms);
            const bgLander = renderer.device.createBindGroup({ layout: renderer.bindGroupLayout, entries: [{ binding: 0, resource: { buffer: uboLander } }] });
            pass.setBindGroup(0, bgLander);
            pass.setVertexBuffer(0, landerBuffer); 
            pass.draw(landerData.length / 3);


            // 6. Moon & Trajectory
            const moonA = 10.0; const moonB = 8.5;
            const moonInclination = 0.26;
            const moonOmega = Math.sqrt(30.0 / Math.pow(moonA, 3)); 
            const moonAngle = time * moonOmega;
            const ex = Math.cos(moonAngle) * moonA;
            const ez = Math.sin(moonAngle) * moonB;
            const moonModel = mat4.create();
            mat4.rotateZ(moonModel, moonModel, moonInclination);
            mat4.translate(moonModel, moonModel, [ex, 0, ez]);
            mat4.rotateY(moonModel, moonModel, -moonAngle + Math.PI);
            mat4.scale(moonModel, moonModel, [0.4, 0.4, 0.4]);
            const moonUniforms = new Float32Array(40);
            moonUniforms.set(vp, 0); moonUniforms.set(moonModel, 16); moonUniforms.set([0.7, 0.7, 0.7, 1], 32); moonUniforms[37] = 1.0;
            const uboMoon = renderer.device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            renderer.device.queue.writeBuffer(uboMoon, 0, moonUniforms);
            const bgMoon = renderer.device.createBindGroup({ layout: renderer.bindGroupLayout, entries: [{ binding: 0, resource: { buffer: uboMoon } }] });
            pass.setBindGroup(0, bgMoon);
            pass.setVertexBuffer(0, sphereBuffer);
            pass.draw(sphereData.length / 3);

            // Orbit Path
            const segments = 128;
            const pathLines = new Float32Array(segments * 6); 
            for (let i = 0; i < segments; i++) {
                const a1 = (i / segments) * Math.PI * 2; const a2 = ((i + 1) / segments) * Math.PI * 2;
                pathLines[i*6+0] = Math.cos(a1)*moonA; pathLines[i*6+2] = Math.sin(a1)*moonB;
                pathLines[i*6+3] = Math.cos(a2)*moonA; pathLines[i*6+5] = Math.sin(a2)*moonB;
            }
            const pathBuffer = renderer.device.createBuffer({ size: pathLines.byteLength, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
            new Float32Array(pathBuffer.getMappedRange()).set(pathLines); pathBuffer.unmap();
            const pathModel = mat4.create(); mat4.rotateZ(pathModel, pathModel, moonInclination);
            const pathUbo = new Float32Array(40); 
            pathUbo.set(vp, 0); 
            pathUbo.set(pathModel, 16); 
            pathUbo.set([1, 1, 0, 1], 32); 
            pathUbo[37] = 0.5; // Path opacity
            pathUbo[39] = 1.0; 
            const uboP = renderer.device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            renderer.device.queue.writeBuffer(uboP, 0, pathUbo);
            const bgP = renderer.device.createBindGroup({ layout: renderer.bindGroupLayout, entries: [{ binding: 0, resource: { buffer: uboP } }] });
            pass.setPipeline(renderer.linePipeline); pass.setBindGroup(0, bgP); pass.setVertexBuffer(0, pathBuffer); pass.draw(segments * 2); pass.setPipeline(renderer.pipeline);

            // 7. Gravity Vectors
            const drawForce = (model: mat4, isStationary = false) => {
                const pos = vec3.fromValues(model[12], model[13], model[14]);
                const dist = vec3.length(pos);
                const forceMag = 18.0 / (dist * dist);
                const forceVec = new Float32Array([pos[0], pos[1], pos[2], pos[0]*(1-forceMag), pos[1]*(1-forceMag), pos[2]*(1-forceMag)]);
                const lb = renderer.device.createBuffer({ size: forceVec.byteLength, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
                new Float32Array(lb.getMappedRange()).set(forceVec); lb.unmap();
                const pu = new Float32Array(40); 
                pu.set(vp, 0); pu.set(mat4.create(), 16); 
                pu.set(isStationary ? [1,1,0,1] : [1,0,0,1], 32); 
                pu[37] = 1.0; // Opacity
                pu[39] = 1.0; // Flat mode
                const uboV = renderer.device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                renderer.device.queue.writeBuffer(uboV, 0, pu);
                const bgV = renderer.device.createBindGroup({ layout: renderer.bindGroupLayout, entries: [{ binding: 0, resource: { buffer: uboV } }] });
                pass.setPipeline(renderer.linePipeline); pass.setBindGroup(0, bgV); pass.setVertexBuffer(0, lb); pass.draw(2); pass.setPipeline(renderer.pipeline);
            };
            drawForce(satModel, true); drawForce(landerModel); drawForce(moonModel);
        });
        
        requestAnimationFrame(frame);
    }
    frame();
}

init();

