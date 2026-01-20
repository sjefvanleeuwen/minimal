import { mat4, vec3, quat } from 'gl-matrix';
import { SceneNode } from './nodes/SceneNode';
import { GroundNode } from './nodes/GroundNode';
import { SphereNode } from './nodes/SphereNode';
import { CubeNode } from './nodes/CubeNode';
import { RampNode } from './nodes/RampNode';
import { DynamicBinaryClient } from './DynamicBinaryClient';

export class SceneManager {
    public nodes: SceneNode[] = [];
    public sphere: SceneNode | null = null;
    private spheres = new Map<number, SceneNode>();
    private serverEntityId: number | null = null;
    private keys: Record<string, boolean> = {};
    private client: DynamicBinaryClient;
    private lastDx = 0;
    private lastDz = 0;

    constructor() {
        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);

        // Simple binary client
        this.client = new DynamicBinaryClient(window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname, 8081);
        
        // 1. Fetch assets first
        this.loadServerAssets().then(async () => {
            // 2. Fetch existing entities info (updates metadataCache and creates initial nodes)
            await this.refreshEntityMetadata();

            // 3. Join the game
            this.client.call('J', 0, new ArrayBuffer(0)).then(resp => {
                const view = new DataView(resp);
                this.serverEntityId = view.getUint32(0, true);
                
                console.log(`[SceneManager] Joined game. My ID: ${this.serverEntityId}`);
                
                this.startNetworkSync();
                this.startStatsSync();
            });
        });
    }

    private startStatsSync() {
        this.client.subscribe('S', (payload: ArrayBuffer) => {
            const view = new DataView(payload);
            const active = view.getUint32(0, true);
            const total = view.getUint32(4, true);
            const clients = view.getUint32(8, true);
            const packets = view.getBigUint64(16, true);
            
            const elActive = document.getElementById('stats-active');
            const elTotal = document.getElementById('stats-total');
            const elClients = document.getElementById('stats-clients');
            const elPackets = document.getElementById('stats-packets');
            
            if (elActive) elActive.textContent = active.toString();
            if (elTotal) elTotal.textContent = total.toString();
            if (elClients) elClients.textContent = clients.toString();
            if (elPackets) elPackets.textContent = packets.toLocaleString();
        });
    }

    private async refreshEntityMetadata() {
        try {
            const resp = await this.client.call('E', 0, new ArrayBuffer(0));
            const view = new DataView(resp);
            const entrySize = 48; // ID(4) + Trans(28) + Color(16)
            for (let i = 0; i < resp.byteLength; i += entrySize) {
                const id = view.getUint32(i, true);
                
                // Get the transform data from the initial sync
                const px = view.getFloat32(i + 4, true);
                const py = view.getFloat32(i + 8, true);
                const pz = view.getFloat32(i + 12, true);
                const rx = view.getFloat32(i + 16, true);
                const ry = view.getFloat32(i + 20, true);
                const rz = view.getFloat32(i + 24, true);
                const rw = view.getFloat32(i + 28, true);

                const r = view.getFloat32(i + 32, true);
                const g = view.getFloat32(i + 36, true);
                const b = view.getFloat32(i + 40, true);
                const a = view.getFloat32(i + 44, true);
                
                let node = this.spheres.get(id);
                if (!node) {
                    node = new CubeNode(1.0);
                    this.spheres.set(id, node);
                    this.nodes.push(node);
                }
                
                node.color = [r, g, b, a];
                vec3.set(node.position, px, py, pz);
                quat.set(node.rotation, rx, ry, rz, rw);

                // Pre-cache for any future stream updates
                this.metadataCache.set(id, [r, g, b, a]);
            }
        } catch (e) {
            console.warn("[SceneManager] Failed to refresh entity metadata", e);
        }
    }

    private metadataCache = new Map<number, [number, number, number, number]>();

    private async loadServerAssets() {
        console.log("[SceneManager] Fetching Server Asset Manifest ('A')...");
        try {
            const resp = await this.client.call('A', 0, new ArrayBuffer(0));
            const jsonStr = new TextDecoder().decode(resp);
            const config = JSON.parse(jsonStr);
            
            if (config.scene && config.scene.nodes) {
                console.log(`[SceneManager] Loading ${config.scene.nodes.length} nodes from server manifest`);
                for (const nodeData of config.scene.nodes) {
                    let node: SceneNode | null = null;
                    const props = nodeData.properties || {};
                    
                    if (nodeData.type === 'Ground') {
                        node = new GroundNode(props.half_extent_x || 100);
                    } else if (nodeData.type === 'Ramp') {
                        node = new RampNode(
                            (props.half_extent_x || 5) * 2,
                            (props.half_extent_y || 0.1) * 2,
                            (props.half_extent_z || 5) * 2
                        );
                        if (props.angle_x_degrees !== undefined) {
                            quat.fromEuler(node.rotation, props.angle_x_degrees, 0, 0);
                        }
                    }
                    
                    if (node) {
                        if (nodeData.position) {
                            vec3.set(node.position, nodeData.position[0], nodeData.position[1], nodeData.position[2]);
                        }
                        this.nodes.push(node);
                    }
                }
            }
        } catch (e) {
            console.error("[SceneManager] Failed to load server assets, using defaults", e);
            // Fallback
            this.nodes.push(new GroundNode(100));
        }
    }

    private startNetworkSync() {
        console.log("[SceneManager] Subscribing to WorldStream...");
        this.client.subscribe('W', (data) => {
            const view = new DataView(data);
            const entrySize = 32; // 4 (ID) + 12 (Pos) + 16 (Rot)
            
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

                let node = this.spheres.get(entityId);
                if (!node) {
                    console.log(`[SceneManager] New entity discovered: ${entityId}`);
                    
                    if (entityId === this.serverEntityId) {
                        node = new SphereNode(1.0);
                        this.sphere = node;
                    } else {
                        node = new CubeNode(1.0);
                    }
                    
                    // Use cached color or request one
                    const cachedColor = this.metadataCache.get(entityId);
                    if (cachedColor) {
                        node.color = cachedColor;
                    } else {
                        this.refreshEntityMetadata();
                    }

                    this.spheres.set(entityId, node);
                    this.nodes.push(node);
                }

                // Update node from server state
                vec3.set(node.position, px, py, pz);
                quat.set(node.rotation, rx, ry, rz, rw);
            }

            // Note: We don't delete immediately because stationary objects stop broadcasting
            // In a production environment, we'd use a separate LifeCycle/Event system.
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
