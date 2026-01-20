# Server-Side Physics & Synchronization Plan (AAA Grade)

This document outlines the architecture and implementation strategy for a high-performance, server-authoritative physics engine integrated into the `@minimal` ecosystem.

## 1. Core Principles
- **Server Authority**: The server is the source of truth for all positions, velocities, and collisions.
- **Determinism**: The simulation must be deterministic to facilitate client-side prediction and reconciliation.
- **Low Latency**: Integration with MBCS (Minimal Binary Contract Specification) for compact packet sizes.
- **Scalability**: Multi-threaded physics simulation and spatial partitioning.

## 2. Technical Stack
- **Physics Engine**: **Jolt Physics** (Modern, multi-threaded, used in AAA titles like Horizon Forbidden West).
- **Entity Component System (ECS)**: **EnTT** (High-performance C++ ECS for managing game state).
- **Communication**: Integrated with `binary_web.h` via high-frequency binary streams (WebSockets).

## 3. Key Features

### A. Fixed Timestep Simulation
The physics world will run at a fixed frequency (e.g., 60Hz) regardless of the server's frame rate to ensure stability.
- Accumulator-based loop.
- Decoupled from networking tick rate (e.g., 60Hz physics, 20Hz network updates).

### B. Character Controller (Kinematic & Dynamic)
- **Server-Authoritative Movement**: Server processes raw inputs (WASD + Look) and returns validated positions.
- **Stair/Slope Handling**: Smooth traversal using Jolt's virtual character controller.
- **Snapping**: Implementation of "Hard Snapping" for high-latency corrections and "Soft Interpolation" for minor drifts.

### C. State Synchronization (Snapshots)
- **Snapshot Compression**: Only send changed entities (Delta compression) using a `dirty` flag system in EnTT.
- **Quantization**: Compressing floats (e.g., position/rotation) into smaller bit-fields to save bandwidth.

### D. Client Prediction & Reconciliation
- **Input History**: Server tracks a buffer of recent inputs from each client.
- **Rewind/Replay**: If a client's predicted position disagrees with the server, the server forces a "Snap" and the client re-simulates from the last known good state.

### E. Lag Compensation
- **History Buffering**: The server keeps a ~500ms history of all entity positions.
- **Raycast Rewind**: For hit detection (shooting), the server rolls back the world to the time the client performed the action to check against what the client saw.

### F. Spatial Partitioning & Interest Management
- **Grid-based Culling**: Only send physics updates to players within a certain radius (AABB or Circle).
- **Static Geometry**: Loading `.obj` or `.gltf` collision hulls into Jolt for the environment.

## 4. Proposed MBCS Protocol Updates

New Endpoint Types:
- `M` (Move): Client -> Server. Schema: `u32:seq, f32:x, f32:z, f32:yaw`.
- `S` (State): Server -> Client (Stream). Schema: `str:payload` (Binary blob of local entity states).

## 5. Implementation Phases

1. **Phase 1: Environment Setup** [COMPLETED]
   - [x] Integrate Jolt Physics via CMake.
   - [x] Setup basic EnTT registry.
   - [x] Create a `PhysicsSystem` class in `server/physics/`.

2. **Phase 2: World Representation** [COMPLETED]
   - [x] Create a static ground plane and simple shapes (Spheres/Boxes).
   - [x] Implement `WorldStream ('W')` to broadcast transforms.

3. **Phase 4: Optimization** [PARTIAL]
   - [ ] Implement delta-compressed snapshots.
   - [x] Multi-thread the Jolt simulation (JobSystem integrated).

4. **Phase 3: Character Controller** [IN-PROGRESS]
   - [x] Map WASD inputs (via `MoveEntity ('M')` command).
   - [ ] Integrate Jolt's `CharacterVirtual` for advanced collision checking.
   - [x] Implement Gravity and dynamic body simulation.
