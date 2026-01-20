import { mat4 } from 'gl-matrix';
import { SceneNode } from './nodes/SceneNode';
import { ShaderEngine } from './ShaderEngine';
import shaderSourceRaw from './shaders/default.wgsl?raw';

export class Renderer {
    private device!: GPUDevice;
    private context!: GPUCanvasContext;
    private format!: GPUTextureFormat;
    private pipeline!: GPURenderPipeline;
    private depthTexture!: GPUTexture;

    constructor(private canvas: HTMLCanvasElement) {}

    async init() {
        console.log("[Renderer] Initializing WebGPU...");
        console.log("[Renderer] Secure Context:", window.isSecureContext);
        console.log("[Renderer] Navigator GPU:", !!navigator.gpu);

        if (!navigator.gpu) {
            if (!window.isSecureContext) {
                throw new Error("WebGPU requires a Secure Context (localhost or HTTPS). Please use http://localhost:3000 instead of an IP address.");
            }
            throw new Error("navigator.gpu is not available in this browser.");
        }

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

        // Sort nodes by alpha: Opaque first (alpha=1.0), then Translucent (alpha < 1.0)
        const sortedNodes = [...nodes].sort((a, b) => {
            const alphaA = a.color[3];
            const alphaB = b.color[3];
            if (alphaA === alphaB) return 0;
            return alphaA < alphaB ? 1 : -1; // Draw opaque first
        });

        for (const node of sortedNodes) {
            const vertices = node.getVertices();
            const vertexBuffer = this.device.createBuffer({
                size: vertices.byteLength,
                usage: GPUBufferUsage.VERTEX,
                mappedAtCreation: true,
            });
            new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
            vertexBuffer.unmap();

            const modelMatrix = node.getModelMatrix();
            const mvpMatrix = mat4.create();
            mat4.multiply(mvpMatrix, viewProjectionMatrix, modelMatrix);

            const uniformData = new Float32Array(16 + 16 + 4); // MVP + Model + Color
            uniformData.set(mvpMatrix);
            uniformData.set(modelMatrix, 16);
            uniformData.set(node.color, 32);

            const uniformBuffer = this.device.createBuffer({
                size: uniformData.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

            const bindGroup = this.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: uniformBuffer },
                    },
                ],
            });

            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.setVertexBuffer(0, vertexBuffer);
            passEncoder.draw(vertices.length / 7);
        }

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    resize() {
        this.createDepthTexture();
    }
}
