import { mat4, vec3, quat } from 'gl-matrix';
import { SceneNode } from './nodes/SceneNode';
import { GroundNode } from './nodes/GroundNode';
import { SphereNode } from './nodes/SphereNode';
import { RampNode } from './nodes/RampNode';
import { DynamicBinaryClient } from './DynamicBinaryClient';

export class SceneManager {
    public nodes: SceneNode[] = [];
    public sphere!: SphereNode;
    public plateau!: RampNode;
    public ramp!: RampNode;
    private serverEntityId: number | null = null;
    private keys: Record<string, boolean> = {};
    private client: DynamicBinaryClient;
    private streamCleanup?: () => void;
    private lastDx = 0;
    private lastDz = 0;

    constructor() {
        this.sphere = new SphereNode(0.5);
        this.sphere.color = [0, 0.5, 1.0, 1.0]; // Server controlled sphere (Blue, Opaque)

        // Robust layout: Thickness 0.2, Top surfaces at Ground=0, Plateau=2
        this.plateau = new RampNode(10, 0.2, 10);
        this.plateau.position = [0, 1.9, -15];

        this.ramp = new RampNode(10, 0.2, 10);
        this.ramp.position = [0, 0.9, -5.0]; 
        quat.fromEuler(this.ramp.rotation, -11.31, 0, 0); 

        // Match server ground box: half-extents 100 -> size 200
        this.nodes.push(new GroundNode(100)); 
        this.nodes.push(this.plateau);
        this.nodes.push(this.ramp);
        this.nodes.push(this.sphere);

        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);

        // Simple binary client
        this.client = new DynamicBinaryClient(window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname, 8081);
        this.startNetworkSync();
    }

    private startNetworkSync() {
        console.log("[SceneManager] Subscribing to WorldStream...");
        this.streamCleanup = this.client.subscribe('W', (data) => {
            // Decoding WorldStream ('W')
            const view = new DataView(data);
            const entrySize = 32; // 4 + 12 + 16
            
            if (data.byteLength > 0) {
                // console.log(`[SceneManager] Received ${data.byteLength} bytes from server`);
            }

            for (let i = 0; i < data.byteLength; i += entrySize) {
                const entityId = view.getUint32(i, true);
                if (this.serverEntityId === null) {
                    this.serverEntityId = entityId;
                    console.log(`[SceneManager] Bound to server entity ID: ${entityId}`);
                }
                
                const px = view.getFloat32(i + 4, true);
                const py = view.getFloat32(i + 8, true);
                const pz = view.getFloat32(i + 12, true);

                const rx = view.getFloat32(i + 16, true);
                const ry = view.getFloat32(i + 20, true);
                const rz = view.getFloat32(i + 24, true);
                const rw = view.getFloat32(i + 28, true);

                // Update sphere from server state
                vec3.set(this.sphere.position, px, py, pz);
                quat.set(this.sphere.rotation, rx, ry, rz, rw);
            }
        });
    }

    update(_delta: number) {
        let dx = 0;
        let dz = 0;
        if (this.keys['w']) { dz -= 1; }
        if (this.keys['s']) { dz += 1; }
        if (this.keys['a']) { dx -= 1; }
        if (this.keys['d']) { dx += 1; }

        if (dx !== this.lastDx || dz !== this.lastDz) {
            this.sendMoveUpdate(dx, 0, dz);
            this.lastDx = dx;
            this.lastDz = dz;
        }
    }

    private sendMoveUpdate(dx: number, dy: number, dz: number) {
        if (this.serverEntityId === null) return;

        // MBCS 'M' Command: u32:entity_id, f32:dx, f32:dy, f32:dz
        const buf = new ArrayBuffer(4 + 12);
        const view = new DataView(buf);
        view.setUint32(0, this.serverEntityId, true); 
        view.setFloat32(4, dx, true);
        view.setFloat32(8, dy, true);
        view.setFloat32(12, dz, true);

        this.client.call('M', 4, buf).then(resp => {
            const status = new Uint32Array(resp)[0];
            if (status !== 1) {
                console.warn(`[SceneManager] Input rejected for entity ${this.serverEntityId}`);
            }
        }).catch(console.error);
    }

    getViewProjectionMatrix(aspect: number): mat4 {
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, (45 * Math.PI) / 180, aspect, 0.1, 100.0);

        const viewMatrix = mat4.create();
        const eye = vec3.fromValues(5, 5, 5);
        const center = vec3.fromValues(0, 0, 0);
        const up = vec3.fromValues(0, 1, 0);
        mat4.lookAt(viewMatrix, eye, center, up);

        const viewProjectionMatrix = mat4.create();
        mat4.multiply(viewProjectionMatrix, projectionMatrix, viewMatrix);
        return viewProjectionMatrix;
    }
}
