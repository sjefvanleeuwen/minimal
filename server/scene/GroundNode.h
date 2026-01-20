#ifndef GROUND_NODE_H
#define GROUND_NODE_H

#include "SceneNode.h"
#include "../physics/Components.h"

class GroundNode : public SceneNode {
public:
    GroundNode(const std::string& name = "Ground") {
        this->name = name;
        this->type = "Ground";
    }
    
    float half_extent_x = 100.0f;
    float half_extent_y = 1.0f;
    float half_extent_z = 100.0f;
    
    void create(PhysicsSystem& physics) override {
        JPH::Vec3 pos(position.x, position.y, position.z);
        JPH::Vec3 ext(half_extent_x, half_extent_y, half_extent_z);
        physics.CreateBox(pos, ext, JPH::EMotionType::Static, Layers::NON_MOVING);
    }
};

#endif