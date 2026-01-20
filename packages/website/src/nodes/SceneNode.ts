import { mat4, vec3, quat } from 'gl-matrix';

export abstract class SceneNode {
    public position: vec3 = vec3.fromValues(0, 0, 0);
    public scale: vec3 = vec3.fromValues(1, 1, 1);
    public rotation: quat = quat.create(); // Use quaternion for AAA physics sync
    public color: number[] = [1, 1, 1, 1];

    // GPU Caching
    public vertexBuffer: GPUBuffer | null = null;
    public vertexCount: number = 0;
    public uniformBuffer: GPUBuffer | null = null;
    public bindGroup: GPUBindGroup | null = null;

    abstract getVertices(): Float32Array;
    
    getModelMatrix(out: mat4): mat4 {
        mat4.identity(out);
        mat4.translate(out, out, this.position);
        
        const rotationMatrix = mat4.create();
        mat4.fromQuat(rotationMatrix, this.rotation);
        mat4.multiply(out, out, rotationMatrix);

        mat4.scale(out, out, this.scale);
        return out;
    }
}
