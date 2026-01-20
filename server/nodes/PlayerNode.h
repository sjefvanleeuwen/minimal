#ifndef PLAYER_NODE_H
#define PLAYER_NODE_H

#include <entt/entt.hpp>
#include "../physics/PhysicsSystem.h"
#include "../physics/Components.h"
#include <Jolt/Jolt.h>

class PlayerNode {
public:
    static entt::entity create(entt::registry& registry, PhysicsSystem& physics, int fd) {
        auto entity = registry.create();
        
        // Random color for the sphere avatar
        float r = (float)(rand() % 100) / 100.0f;
        float g = (float)(rand() % 100) / 100.0f;
        float b = (float)(rand() % 100) / 100.0f;
        
        // Create physics body (Sphere avatar)
        auto body_id = physics.CreateSphere(JPH::Vec3(0, 5, 0), 1.0f, JPH::EMotionType::Dynamic, Layers::MOVING);
        
        // Add components
        registry.emplace<PlayerComponent>(entity, fd);
        registry.emplace<PhysicsComponent>(entity, body_id);
        registry.emplace<TransformComponent>(entity, 0.0f, 5.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f);
        registry.emplace<InputComponent>(entity, 0.0f, 0.0f, 0.0f);
        registry.emplace<ColorComponent>(entity, r, g, b, 1.0f);
        
        return entity;
    }

    static void destroy(entt::registry& registry, PhysicsSystem& physics, entt::entity entity) {
        if (registry.valid(entity)) {
            if (auto* pc = registry.try_get<PhysicsComponent>(entity)) {
                physics.GetBodyInterface().RemoveBody(pc->body_id);
                physics.GetBodyInterface().DestroyBody(pc->body_id);
            }
            registry.destroy(entity);
        }
    }
};

#endif
