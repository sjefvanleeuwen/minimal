import { mat4, vec3, quat } from 'gl-matrix';

export abstract class SceneNode {
    public position: vec3 = vec3.fromValues(0, 0, 0);
    public scale: vec3 = vec3.fromValues(1, 1, 1);
    public rotation: quat = quat.create(); // Use quaternion for AAA physics sync
    public color: number[] = [1, 1, 1, 1];

    abstract getVertices(): Float32Array;
    
    getModelMatrix(): mat4 {
        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, this.position);
        
        const rotationMatrix = mat4.create();
        mat4.fromQuat(rotationMatrix, this.rotation);
        mat4.multiply(modelMatrix, modelMatrix, rotationMatrix);

        mat4.scale(modelMatrix, modelMatrix, this.scale);
        return modelMatrix;
    }
}
