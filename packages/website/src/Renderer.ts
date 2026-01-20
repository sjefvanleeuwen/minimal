import { mat4 } from 'gl-matrix';
import { SceneNode } from './nodes/SceneNode';
import { GroundNode } from './nodes/GroundNode';
import { RampNode } from './nodes/RampNode';
import { ShaderEngine } from './ShaderEngine';
import shaderSourceRaw from './shaders/default.wgsl?raw';

export class Renderer {
    private device!: GPUDevice;
    private context!: GPUCanvasContext;
    private format!: GPUTextureFormat;
    private pipeline!: GPURenderPipeline;
    private depthTexture!: GPUTexture;

    // Working memory to avoid GC
    private modelMatrix = mat4.create();
    private mvpMatrix = mat4.create();
    private uniformData = new Float32Array(16 + 16 + 4 + 4); 

    constructor(private canvas: HTMLCanvasElement) {}

    async init() {
        // ...Existing initialization...
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: "high-performance"
        });
        
        if (!adapter) {
            console.warn("[Renderer] High-performance adapter failed, trying default...");
            const fallbackAdapter = await navigator.gpu.requestAdapter();
            if (!fallbackAdapter) throw new Error("No GPU adapter found even with fallback.");
            this.device = await fallbackAdapter.requestDevice();
        } else {
            this.device = await adapter.requestDevice();
        }

        console.log("[Renderer] Device acquired:", this.device);

        this.context = this.canvas.getContext("webgpu")!;
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "premultiplied",
        });

        // Use imported shader with templating
        const shaderSource = ShaderEngine.process(shaderSourceRaw, { VERSION: '1.0' });

        const shaderModule = this.device.createShaderModule({
            code: shaderSource,
        });

        this.pipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [
                    {
                        arrayStride: 28, // 7 floats (vec4 pos + vec3 localPos)
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: "float32x4" },
                            { shaderLocation: 1, offset: 16, format: "float32x3" }
                        ],
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{ 
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: "src-alpha",
                            dstFactor: "one-minus-src-alpha",
                            operation: "add",
                        },
                        alpha: {
                            srcFactor: "one",
                            dstFactor: "one-minus-src-alpha",
                            operation: "add",
                        },
                    }
                }],
            },
            primitive: { topology: "triangle-list" },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            multisample: { count: 1 },
        });

        this.createDepthTexture();
    }

    private createDepthTexture() {
        if (this.depthTexture) this.depthTexture.destroy();
        this.depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    render(nodes: SceneNode[], viewProjectionMatrix: mat4) {
        const commandEncoder = this.device.createCommandEncoder();
        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.pipeline);

        // Sort nodes by alpha
        const sortedNodes = [...nodes].sort((a, b) => {
            const alphaA = a.color[3];
            const alphaB = b.color[3];
            return alphaA < alphaB ? 1 : (alphaA > alphaB ? -1 : 0);
        });

        for (const node of sortedNodes) {
            // 1. Lazy-init Static Resources (Buffer & BindGroup)
            if (!node.vertexBuffer) {
                const vertices = node.getVertices();
                node.vertexBuffer = this.device.createBuffer({
                    size: vertices.byteLength,
                    usage: GPUBufferUsage.VERTEX,
                    mappedAtCreation: true,
                });
                new Float32Array(node.vertexBuffer.getMappedRange()).set(vertices);
                node.vertexBuffer.unmap();
                node.vertexCount = vertices.length / 7;

                // Create individual uniform buffer per node to allow independent updates
                node.uniformBuffer = this.device.createBuffer({
                    size: this.uniformData.byteLength,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });

                node.bindGroup = this.device.createBindGroup({
                    layout: this.pipeline.getBindGroupLayout(0),
                    entries: [{ binding: 0, resource: { buffer: node.uniformBuffer } }],
                });
            }

            // 2. Update Dynamic Data (Transforms)
            node.getModelMatrix(this.modelMatrix);
            mat4.multiply(this.mvpMatrix, viewProjectionMatrix, this.modelMatrix);

            this.uniformData.set(this.mvpMatrix);
            this.uniformData.set(this.modelMatrix, 16);
            this.uniformData.set(node.color, 32);
            
            // nodeType: 0 = Static (World Checker), 1 = Dynamic (Local Checker)
            let nodeType = 1.0;
            if (node instanceof GroundNode || node instanceof RampNode) {
                nodeType = 0.0;
            }
            this.uniformData[36] = nodeType;

            // Submit update to node's private buffer
            this.device.queue.writeBuffer(node.uniformBuffer!, 0, this.uniformData);

            // 3. Draw
            passEncoder.setBindGroup(0, node.bindGroup!);
            passEncoder.setVertexBuffer(0, node.vertexBuffer);
            passEncoder.draw(node.vertexCount);
        }

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    resize() {
        this.createDepthTexture();
    }
}
