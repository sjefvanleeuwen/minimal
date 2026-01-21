# Planetary Physics with Jolt

Implementing physics on a planetary scale introduces several challenges that differ from standard "flat world" simulations. While Jolt is optimized for large-scale environments, transitioning from a uniform downward gravity vector to a spherical, center-of-mass gravity requires specific architectural adjustments.

## 1. Spherical Gravity (Point Gravity)

In a standard simulation, gravity is defined globally (e.g., `0, -9.81, 0`). For a planet, the gravity vector $\vec{g}$ at any point $\vec{P}$ depends on the planet's center $\vec{C}$:

$$\vec{g} = \frac{\vec{C} - \vec{P}}{|\vec{C} - \vec{P}|} \cdot G$$

### Implementation in Jolt

Jolt allows you to override gravity per-body or globally. For a planetary body, you should:

1.  **Set Global Gravity to Zero**: Disable the default linear gravity in `JPH::PhysicsSystem::SetGravity(JPH::Vec3::sZero())`.
2.  **Apply Manual Force**: Use the `BodyInterface::AddForce` or `AddImpulse` every step, or more efficiently, implement a **custom step listener**.

```cpp
// Example of applying point gravity in the physics update loop
auto& bi = physics_system.GetBodyInterface();
JPH::Vec3 planet_center(0, 0, 0);
float gravity_strength = 9.81f;

for (auto& body_id : active_bodies) {
    JPH::Vec3 pos = bi.GetPosition(body_id);
    JPH::Vec3 to_center = (planet_center - pos).Normalized();
    bi.AddForce(body_id, to_center * gravity_strength * mass);
}
```

## 2. Character Orientation

The most significant complexity is that "Up" is no longer `[0, 1, 0]`. Every entity must calculate its own local orientation based on its position on the sphere.

### The Up Vector
At any position $\vec{P}$, the surface normal (and thus the "Up" direction) is:
$$\hat{u} = \frac{\vec{P} - \vec{C}}{|\vec{P} - \vec{C}|}$$

### Character Controller Alignment
To keep a character upright on a planet:
1.  Calculate current $\hat{u}$.
2.  Create a rotation that aligns the character's internal "Up" axis with $\hat{u}$.
3.  Apply this as a target rotation to the character body or camera.

## 3. Reference Frames and Perspectives

Visualizing planetary physics requires transitioning between different spatial contexts.

### Global vs. Local Observation
*   **Orbital View (Global)**: The camera is fixed in world-space or follows a lagrange point, observing the planet's rotation and satellite trajectories. Useful for telemetry and situational awareness.
*   **Surface View (First-Person)**: The camera is parented to a surface entity. The `view` matrix must be constructed using the entity's position as the eye and the local surface normal as the `up` vector.

### Camera Matrix Construction
To transition a camera to first-person surface view:
1.  **Position**: $\vec{E} = \text{LanderPosition} + \alpha \cdot \hat{u}$ (where $\alpha$ is eye-height).
2.  **Direction**: $\vec{F} = \text{SurfaceTangent}$.
3.  **View Matrix**: $V = \text{lookAt}(\vec{E}, \vec{E} + \vec{F}, \hat{u})$.

## 4. Geodesic Traversal and Singularities

When navigating a sphere using polar coordinates ($\phi, \theta$), traditional controls often "stick" at the poles ($0, \pi$) as the longitudinal degree of freedom enters a gimbal lock-like state.

### Pole-Crossing Continuity
To allow continuous movement through the poles in a simplified spherical simulation:
1.  **Reflection**: When $\theta < 0$ or $\theta > \pi$, reflect the value back into the valid $[0, \pi]$ range.
2.  **Longitude Flip**: Add $\pi$ (180°) to the longitude $\phi$.
3.  **Normalization**: Ensure $\phi$ remains within $[0, 2\pi]$ using modulo arithmetic.

This ensures that a character walking "North" across the pole continues moving "South" on the opposite meridian without a hard stop.

## 5. Large Scale Stability (Floating Point Precision)

Jolt uses single-precision floats. If your planet has a realistic radius (e.g., Earth at 6,371km), entities at the surface will experience significant floating-point jitter due to the distance from the origin `(0,0,0)`.

### Floating Origin Solution
To solve this, the simulation should use a **Floating Origin** or **Local Centers**:
*   The physics world is kept small (e.g., a few kilometers).
*   As the player moves, the entire world (including the planet surface segments) is shifted so the player stays near `(0,0,0)`.
*   Alternatively, run the simulation in "Double Precision" (not natively supported by Jolt's core SIMD paths) or use multiple physics sub-worlds for different regions.

## 4. Atmosphere and Damping

Planetary bodies often involve atmospheric drag. Unlike linear damping, atmospheric drag should be calculated based on the square of the velocity and the current air density $\rho$ (which decreases with altitude $h$):

$$F_d = \frac{1}{2} \rho(h) v^2 C_d A$$

In Jolt, this is best implemented within a sub-step listener to ensure it reacts correctly during high-speed entries.

## Summary

Jolt works exceptionally well for planetary bodies because of its robust `BodyInterface` and ability to handle arbitrary orientations. The transition requires moving from **Universal Constants** to **Positional Calculations** for every force applied.