export class GeometryFactory {
    static createSphere(radius: number, segments: number): Float32Array {
        const data: number[] = [];
        for (let j = 0; j < segments; j++) {
            const theta1 = (j / segments) * Math.PI;
            const theta2 = ((j + 1) / segments) * Math.PI;
            for (let i = 0; i < segments; i++) {
                const phi1 = (i / segments) * Math.PI * 2;
                const phi2 = ((i + 1) / segments) * Math.PI * 2;

                const getPoint = (theta: number, phi: number) => [
                    radius * Math.sin(theta) * Math.cos(phi),
                    radius * Math.cos(theta),
                    radius * Math.sin(theta) * Math.sin(phi)
                ];

                const v1 = getPoint(theta1, phi1);
                const v2 = getPoint(theta1, phi2);
                const v3 = getPoint(theta2, phi1);
                const v4 = getPoint(theta2, phi2);

                data.push(...v1, ...v3, ...v2);
                data.push(...v2, ...v3, ...v4);
            }
        }
        return new Float32Array(data);
    }

    static createPyramid(size: number): Float32Array {
        const s = size;
        const h = size * 2;
        return new Float32Array([
            -s, 0, -s,  s, 0, -s,  s, 0, s,
            -s, 0, -s,  s, 0, s,  -s, 0, s,
            0, h, 0,  -s, 0, -s,   s, 0, -s,
            0, h, 0,   s, 0, -s,   s, 0, s,
            0, h, 0,   s, 0, s,   -s, 0, s,
            0, h, 0,  -s, 0, s,   -s, 0, -s,
        ]);
    }

    static createGrid(size: number, div: number): Float32Array {
        const data: number[] = [];
        for (let i = -div; i <= div; i++) {
            const p = (i / div) * size;
            data.push(-size, 0, p, size, 0, p);
            data.push(p, 0, -size, p, 0, size);
        }
        return new Float32Array(data);
    }

    static projectPoint(face: number, u: number, v: number, radius: number) {
        let x, y, z;
        if (face === 0) { x = 1; y = v; z = -u; }
        else if (face === 1) { x = -1; y = v; z = u; }
        else if (face === 2) { x = u; y = 1; z = -v; }
        else if (face === 3) { x = u; y = -1; z = v; }
        else if (face === 4) { x = u; y = v; z = 1; }
        else { x = -u; y = v; z = -1; }
        const len = Math.sqrt(x*x + y*y + z*z);
        return [x/len * radius, y/len * radius, z/len * radius];
    }

    static createPatch(face: number, px: number, py: number, res: number, radius: number, grid: number): Float32Array {
        const data: number[] = [];
        const patchSize = 2.0 / res;
        const startX = -1.0 + px * patchSize;
        const startY = -1.0 + py * patchSize;
        const gStep = patchSize / grid;

        for (let i = 0; i < grid; i++) {
            for (let j = 0; j < grid; j++) {
                const u1 = startX + i * gStep, u2 = startX + (i+1) * gStep;
                const v1 = startY + j * gStep, v2 = startY + (j+1) * gStep;
                const p1 = this.projectPoint(face, u1, v1, radius);
                const p2 = this.projectPoint(face, u2, v1, radius);
                const p3 = this.projectPoint(face, u2, v2, radius);
                const p4 = this.projectPoint(face, u1, v2, radius);
                data.push(...p1, ...p2, ...p3, ...p3, ...p4, ...p1);
            }
        }
        return new Float32Array(data);
    }
}
