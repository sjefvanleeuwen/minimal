import { SceneNode } from './SceneNode';

export class SphereNode extends SceneNode {
    constructor(radius: number = 1) {
        super();
        this.scale = [radius, radius, radius];
        this.color = [1.0, 0.0, 0.0, 1.0];
        this.position = [0, radius, 0];
    }

    getVertices(): Float32Array {
        const latitudeBands = 32;
        const longitudeBands = 32;
        const vertices = [];

        for (let lat = 0; lat < latitudeBands; lat++) {
            const theta1 = (lat * Math.PI) / latitudeBands;
            const theta2 = ((lat + 1) * Math.PI) / latitudeBands;

            for (let lon = 0; lon < longitudeBands; lon++) {
                const phi1 = (lon * 2 * Math.PI) / longitudeBands;
                const phi2 = ((lon + 1) * 2 * Math.PI) / longitudeBands;

                // Two triangles per band segment
                const p1 = this.getPoint(theta1, phi1);
                const p2 = this.getPoint(theta1, phi2);
                const p3 = this.getPoint(theta2, phi1);
                const p4 = this.getPoint(theta2, phi2);

                // Consistent CCW Winding: 
                // T1: P1, P3, P2
                vertices.push(...p1, 1, ...p1); 
                vertices.push(...p3, 1, ...p3);
                vertices.push(...p2, 1, ...p2);
                
                // T2: P3, P4, P2
                vertices.push(...p3, 1, ...p3);
                vertices.push(...p4, 1, ...p4);
                vertices.push(...p2, 1, ...p2);
            }
        }
        return new Float32Array(vertices);
    }

    private getPoint(theta: number, phi: number): number[] {
        return [
            Math.sin(theta) * Math.cos(phi),
            Math.cos(theta),
            Math.sin(theta) * Math.sin(phi)
        ];
    }
}
