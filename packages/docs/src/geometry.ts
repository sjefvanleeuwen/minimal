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
}
