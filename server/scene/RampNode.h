#ifndef RAMP_NODE_H
#define RAMP_NODE_H

#include "SceneNode.h"
#include "../physics/Components.h"

class RampNode : public SceneNode {
public:
    RampNode(const std::string& name = "Ramp") {
        this->name = name;
        this->type = "Ramp";
    }
    
    float half_extent_x = 5.0f;
    float half_extent_y = 0.1f;
    float half_extent_z = 5.0f;
    float angle_x_degrees = -11.31f;  // Pitch angle
    
    void create(PhysicsSystem& physics) override {
        JPH::Vec3 pos(position.x, position.y, position.z);
        JPH::Vec3 ext(half_extent_x, half_extent_y, half_extent_z);
        
        // Convert angle to radians and create quaternion
        float angle_rad = angle_x_degrees * 3.14159265f / 180.0f;
        JPH::Quat rot = JPH::Quat::sRotation(JPH::Vec3::sAxisX(), angle_rad);
        
        physics.CreateBox(pos, ext, JPH::EMotionType::Static, Layers::NON_MOVING, rot);
    }
};

#endif