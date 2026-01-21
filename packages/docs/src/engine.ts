import { mat4 } from 'gl-matrix';
import { wgsl } from './shaders';

export interface Renderer {
    device: GPUDevice;
    format: GPUTextureFormat;
    render(canvas: HTMLCanvasElement, drawFn: (pass: GPURenderPassEncoder) => void): void;
}

export class WebGPURenderer implements Renderer {
    device!: GPUDevice;
    format!: GPUTextureFormat;
    pipeline!: GPURenderPipeline;
    linePipeline!: GPURenderPipeline;
    bindGroupLayout!: GPUBindGroupLayout;
    depthTexture: GPUTexture | null = null;

    static async create(): Promise<WebGPURenderer> {
        if (!navigator.gpu) throw new Error("WebGPU not supported");
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No adapter");
        const device = await adapter.requestDevice();
        
        const renderer = new WebGPURenderer();
        renderer.device = device;
        renderer.format = navigator.gpu.getPreferredCanvasFormat();
        
        renderer.bindGroupLayout = device.createBindGroupLayout({
            label: 'Main Bind Group Layout',
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }]
        });

        const module = device.createShaderModule({ label: 'Main Shader Module', code: wgsl });
        renderer.pipeline = renderer.createRenderPipeline(module, 'triangle-list');
        renderer.linePipeline = renderer.createRenderPipeline(module, 'line-list');

        return renderer;
    }

    createRenderPipeline(module: GPUShaderModule, topology: GPUPrimitiveTopology): GPURenderPipeline {
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout]
        });

        return this.device.createRenderPipeline({
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
                    format: this.format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
                    }
                }]
            },
            primitive: { topology },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
        });
    }

    render(canvas: HTMLCanvasElement, drawFn: (pass: GPURenderPassEncoder) => void) {
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            this.depthTexture?.destroy();
            this.depthTexture = null;
        }

        const context = canvas.getContext('webgpu')!;
        context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        if (!this.depthTexture) {
            this.depthTexture = this.device.createTexture({
                size: [canvas.width || 1, canvas.height || 1],
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
        }

        const commandEncoder = this.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
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

        drawFn(renderPass);
        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    createBuffer(data: Float32Array, usage: GPUBufferUsageFlags = GPUBufferUsage.VERTEX): GPUBuffer {
        const buffer = this.device.createBuffer({
            size: data.byteLength,
            usage: usage | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(buffer.getMappedRange()).set(data);
        buffer.unmap();
        return buffer;
    }

    createUniformBuffer(data: Float32Array): GPUBuffer {
        return this.createBuffer(data, GPUBufferUsage.UNIFORM);
    }
}
