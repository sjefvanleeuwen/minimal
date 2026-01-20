import { mat4, vec3, quat } from 'gl-matrix';
import { SceneNode } from './nodes/SceneNode';
import { GroundNode } from './nodes/GroundNode';
import { SphereNode } from './nodes/SphereNode';
import { RampNode } from './nodes/RampNode';
import { DynamicBinaryClient } from './DynamicBinaryClient';

export class SceneManager {
    public nodes: SceneNode[] = [];
    public sphere: SphereNode | null = null;
    private spheres = new Map<number, SphereNode>();
    public ramp!: RampNode;
    private serverEntityId: number | null = null;
    private keys: Record<string, boolean> = {};
    private client: DynamicBinaryClient;
    private streamCleanup?: () => void;
    private lastDx = 0;
    private lastDz = 0;

    constructor() {
        this.ramp = new RampNode(10, 0.2, 10);
        this.ramp.position = [0, 0.9, -5.0]; 
        quat.fromEuler(this.ramp.rotation, -11.31, 0, 0); 

        // Match server ground box: half-extents 100 -> size 200
        this.nodes.push(new GroundNode(100)); 
        this.nodes.push(this.ramp);

        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);

        // Simple binary client
        this.client = new DynamicBinaryClient(window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname, 8081);
        
        // Join the game first
        this.client.call('J', 0, new ArrayBuffer(0)).then(resp => {
            const view = new DataView(resp);
            this.serverEntityId = view.getUint32(0, true);
            console.log(`[SceneManager] Joined game. My Entity ID: ${this.serverEntityId}`);
            this.startNetworkSync();
        });
    }

    private startNetworkSync() {
        console.log("[SceneManager] Subscribing to WorldStream...");
        this.streamCleanup = this.client.subscribe('W', (data) => {
            const view = new DataView(data);
            const entrySize = 48; // 4 (ID) + 12 (Pos) + 16 (Rot) + 16 (Color)
            
            // Keep track of which entities we saw this frame
            const seenIds = new Set<number>();

            for (let i = 0; i < data.byteLength; i += entrySize) {
                const entityId = view.getUint32(i, true);
                seenIds.add(entityId);
                
                const px = view.getFloat32(i + 4, true);
                const py = view.getFloat32(i + 8, true);
                const pz = view.getFloat32(i + 12, true);

                const rx = view.getFloat32(i + 16, true);
                const ry = view.getFloat32(i + 20, true);
                const rz = view.getFloat32(i + 24, true);
                const rw = view.getFloat32(i + 28, true);

                const cr = view.getFloat32(i + 32, true);
                const cg = view.getFloat32(i + 36, true);
                const cb = view.getFloat32(i + 40, true);
                const ca = view.getFloat32(i + 44, true);

                let sphere = this.spheres.get(entityId);
                if (!sphere) {
                    console.log(`[SceneManager] New sphere discovered: ${entityId}`);
                    sphere = new SphereNode(1.0);
                    sphere.color = [cr, cg, cb, ca];
                    this.spheres.set(entityId, sphere);
                    this.nodes.push(sphere);
                    
                    // If this is OUR sphere, set the main reference for camera follow
                    if (entityId === this.serverEntityId) {
                        this.sphere = sphere;
                    }
                }

                // Update sphere from server state
                vec3.set(sphere.position, px, py, pz);
                quat.set(sphere.rotation, rx, ry, rz, rw);
            }

            // Optional: Cleanup spheres that are no longer in the stream
            for (const [id, sphere] of this.spheres.entries()) {
                if (!seenIds.has(id)) {
                    console.log(`[SceneManager] Sphere removed: ${id}`);
                    this.nodes = this.nodes.filter(n => n !== sphere);
                    this.spheres.delete(id);
                    if (id === this.serverEntityId) this.sphere = null;
                }
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
        mat4.perspective(projectionMatrix, (45 * Math.PI) / 180, aspect, 0.1, 1000.0);

        const viewMatrix = mat4.create();
        
        // Camera Follow Logic: Stay behind and above the ball
        // We'll use a fixed offset relative to the ball's position
        const ballPos = this.sphere ? this.sphere.position : vec3.fromValues(0, 0, 0);
        const offset = vec3.fromValues(10, 10, 15);
        const eye = vec3.create();
        vec3.add(eye, ballPos, offset);
        
        const center = vec3.clone(ballPos);
        center[1] += 1.0; // Look slightly above the ball
        
        const up = vec3.fromValues(0, 1, 0);
        mat4.lookAt(viewMatrix, eye, center, up);

        const viewProjectionMatrix = mat4.create();
        mat4.multiply(viewProjectionMatrix, projectionMatrix, viewMatrix);
        return viewProjectionMatrix;
    }
}
