import { SceneNode } from './SceneNode';

export class GroundNode extends SceneNode {
    constructor(size: number = 10) {
        super();
        this.scale = [size, 1, size];
        this.color = [0.2, 0.2, 0.2, 1.0];
    }

    getVertices(): Float32Array {
        // Simple quad with 7 floats per vertex: Pos (4) + LocalPos (3)
        return new Float32Array([
            -1, 0, -1, 1, -1, 0, -1,
             1, 0, -1, 1,  1, 0, -1,
            -1, 0,  1, 1, -1, 0,  1,
            -1, 0,  1, 1, -1, 0,  1,
             1, 0, -1, 1,  1, 0, -1,
             1, 0,  1, 1,  1, 0,  1,
        ]);
    }
}
