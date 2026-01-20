#ifndef SCENE_NODE_H
#define SCENE_NODE_H

#include <string>

// Simple 3D vector
struct Vec3 {
    float x = 0, y = 0, z = 0;
};

// Simple quaternion
struct Quat {
    float x = 0, y = 0, z = 0, w = 1;
};

// Simple 4D color
struct Color {
    float r = 1, g = 1, b = 1, a = 1;
};

#include "../physics/PhysicsSystem.h"

class SceneNode {
public:
    virtual ~SceneNode() = default;
    
    std::string name;
    std::string type;
    
    virtual void create(PhysicsSystem& physics) = 0;
    
    // Common properties
    Vec3 position;
    Quat rotation;
    Vec3 scale{1, 1, 1};
    Color color;
};

#endif