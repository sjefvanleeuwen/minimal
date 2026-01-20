#ifndef CRATE_NODE_H
#define CRATE_NODE_H

#include <entt/entt.hpp>
#include "../physics/PhysicsSystem.h"
#include "../physics/Components.h"
#include <Jolt/Jolt.h>

class CrateNode {
public:
    static void create_stack(entt::registry& registry, PhysicsSystem& physics, JPH::Vec3 start_pos, int rows, int cols, int height) {
        float size = 1.0f;
        float spacing = 0.01f; // Minimal spacing to avoid initial overlap jitter

        for (int h = 0; h < height; ++h) {
            for (int r = 0; r < rows; ++r) {
                for (int c = 0; c < cols; ++c) {
                    auto entity = registry.create();
                    
                    JPH::Vec3 pos = start_pos + JPH::Vec3(r * (size + spacing), h * (size), c * (size + spacing)) + JPH::Vec3(0, size * 0.5f, 0);
                    
                    // Create physics body (Box)
                    auto body_id = physics.CreateBox(pos, JPH::Vec3(size * 0.5f, size * 0.5f, size * 0.5f), JPH::EMotionType::Dynamic, Layers::MOVING, JPH::Quat::sIdentity(), 0.9f, 10.0f);
                    
                    // Add components
                    registry.emplace<PhysicsComponent>(entity, body_id);
                    registry.emplace<TransformComponent>(entity, pos.GetX(), pos.GetY(), pos.GetZ(), 0.0f, 0.0f, 0.0f, 1.0f);
                    registry.emplace<ColorComponent>(entity, 0.6f, 0.4f, 0.2f, 1.0f); // Brownish crate color
                }
            }
        }
    }
};

#endif
