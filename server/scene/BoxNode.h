#ifndef BOX_NODE_H
#define BOX_NODE_H

#include "SceneNode.h"
#include "../physics/Components.h"

class BoxNode : public SceneNode {
public:
    BoxNode(const std::string& name = "Box") {
        this->name = name;
        this->type = "Box";
    }
    
    float half_extent_x = 1.0f;
    float half_extent_y = 1.0f;
    float half_extent_z = 1.0f;
    bool is_dynamic = false;
    
    void create(PhysicsSystem& physics) override {
        JPH::Vec3 pos(position.x, position.y, position.z);
        JPH::Vec3 ext(half_extent_x, half_extent_y, half_extent_z);
        JPH::EMotionType motion = is_dynamic ? JPH::EMotionType::Dynamic : JPH::EMotionType::Static;
        JPH::ObjectLayer layer = is_dynamic ? Layers::MOVING : Layers::NON_MOVING;
        
        physics.CreateBox(pos, ext, motion, layer);
    }
};

#endif