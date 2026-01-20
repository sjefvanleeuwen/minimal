#ifndef COMPONENTS_H
#define COMPONENTS_H

#include <Jolt/Jolt.h>
#include <Jolt/Physics/Body/BodyID.h>

struct TransformComponent {
    float x, y, z;
    float rx, ry, rz, rw;
};

struct PhysicsComponent {
    JPH::BodyID body_id;
};

struct InputComponent {
    float dx = 0;
    float dy = 0;
    float dz = 0;
};

#endif
