import { SceneNode } from './SceneNode';

export class CubeNode extends SceneNode {
    constructor(size: number = 1) {
        super();
        this.scale = [size, size, size];
        this.color = [0.6, 0.4, 0.2, 1.0];
    }

    getVertices(): Float32Array {
        const s = 0.5;
        const vertices: number[] = [];

        // Helper to add a quad (2 triangles) with a specific color modifier
        const addQuad = (
            p1: number[], p2: number[], p3: number[], p4: number[], 
            _norm: number[], _colorMod: number
        ) => {
            // Triangle 1
            vertices.push(...p1, 1.0, ...p1); // Use local position as shader location 1
            vertices.push(...p2, 1.0, ...p2);
            vertices.push(...p3, 1.0, ...p3);
            // Triangle 2
            vertices.push(...p1, 1.0, ...p1);
            vertices.push(...p3, 1.0, ...p3);
            vertices.push(...p4, 1.0, ...p4);
        };

        // Helper to add a 2x2 checkerboard face
        const addCheckerFace = (
            axis: 'x' | 'y' | 'z', 
            side: 1 | -1
        ) => {
            const norm = [0, 0, 0];
            const idx = axis === 'x' ? 0 : (axis === 'y' ? 1 : 2);
            norm[idx] = side;

            for (let u = 0; u < 2; u++) {
                for (let v = 0; v < 2; v++) {
                    const colorMod = (u + v) % 2 === 0 ? 1.0 : 0.7;
                    
                    const u1 = -s + u * s;
                    const u2 = -s + (u + 1) * s;
                    const v1 = -s + v * s;
                    const v2 = -s + (v + 1) * s;
                    const depth = side * s;

                    let p1, p2, p3, p4;
                    if (axis === 'z') {
                        p1 = [u1, v1, depth]; p2 = [u2, v1, depth]; p3 = [u2, v2, depth]; p4 = [u1, v2, depth];
                        if (side < 0) [p1, p2, p3, p4] = [p1, p4, p3, p2]; // Flip winding
                    } else if (axis === 'x') {
                        p1 = [depth, u1, v1]; p2 = [depth, u2, v1]; p3 = [depth, u2, v2]; p4 = [depth, u1, v2];
                        if (side > 0) [p1, p2, p3, p4] = [p1, p4, p3, p2]; // Flip winding
                    } else { // y
                        p1 = [u1, depth, v1]; p2 = [u2, depth, v1]; p3 = [u2, depth, v2]; p4 = [u1, depth, v2];
                        if (side < 0) [p1, p2, p3, p4] = [p1, p4, p3, p2]; // Flip winding
                    }
                    addQuad(p1, p2, p3, p4, norm, colorMod);
                }
            }
        };

        addCheckerFace('z', 1);
        addCheckerFace('z', -1);
        addCheckerFace('x', 1);
        addCheckerFace('x', -1);
        addCheckerFace('y', 1);
        addCheckerFace('y', -1);

        return new Float32Array(vertices);
    }
}
