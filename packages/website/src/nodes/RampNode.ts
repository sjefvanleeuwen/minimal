import { SceneNode } from './SceneNode';
import { mat4, quat } from 'gl-matrix';

export class RampNode extends SceneNode {
    private width: number;
    private height: number;
    private depth: number;

    constructor(width: number, height: number, depth: number) {
        super();
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.scale = [width, height, depth];
        this.color = [0.7, 0.7, 0.7, 1.0]; // Gray Ramp
    }

    getVertices(): Float32Array {
        // A box centered at origin (local space)
        // Stride 7: Pos(4) + LocalPos(3)
        const vertices = [];
        const x = 0.5;
        const y = 0.5;
        const z = 0.5;

        const faces = [
            // Front
            { pos: [-x, -y,  z], norm: [0, 0, 1] },
            { pos: [ x, -y,  z], norm: [0, 0, 1] },
            { pos: [ x,  y,  z], norm: [0, 0, 1] },
            { pos: [-x,  y,  z], norm: [0, 0, 1] },
            // Back
            { pos: [-x, -y, -z], norm: [0, 0, -1] },
            { pos: [-x,  y, -z], norm: [0, 0, -1] },
            { pos: [ x,  y, -z], norm: [0, 0, -1] },
            { pos: [ x, -y, -z], norm: [0, 0, -1] },
            // Top
            { pos: [-x,  y, -z], norm: [0, 1, 0] },
            { pos: [-x,  y,  z], norm: [0, 1, 0] },
            { pos: [ x,  y,  z], norm: [0, 1, 0] },
            { pos: [ x,  y, -z], norm: [0, 1, 0] },
            // Bottom
            { pos: [-x, -y, -z], norm: [0, -1, 0] },
            { pos: [ x, -y, -z], norm: [0, -1, 0] },
            { pos: [ x, -y,  z], norm: [0, -1, 0] },
            { pos: [-x, -y,  z], norm: [0, -1, 0] },
            // Right
            { pos: [ x, -y, -z], norm: [1, 0, 0] },
            { pos: [ x,  y, -z], norm: [1, 0, 0] },
            { pos: [ x,  y,  z], norm: [1, 0, 0] },
            { pos: [ x, -y,  z], norm: [1, 0, 0] },
            // Left
            { pos: [-x, -y, -z], norm: [-1, 0, 0] },
            { pos: [-x, -y,  z], norm: [-1, 0, 0] },
            { pos: [-x,  y,  z], norm: [-1, 0, 0] },
            { pos: [-x,  y, -z], norm: [-1, 0, 0] },
        ];

        const indices = [
            0, 1, 2, 0, 2, 3,    // front
            4, 5, 6, 4, 6, 7,    // back
            8, 9, 10, 8, 10, 11, // top
            12, 13, 14, 12, 14, 15, // bottom
            16, 17, 18, 16, 18, 19, // right
            20, 21, 22, 20, 22, 23, // left
        ];

        for (const i of indices) {
            const f = faces[i];
            vertices.push(...f.pos, 1.0); // vec4 position
            vertices.push(...f.pos);      // vec3 local position
        }

        return new Float32Array(vertices);
    }
}
