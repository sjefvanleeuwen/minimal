#ifndef PHYSICS_CONTROLLER_H
#define PHYSICS_CONTROLLER_H

#include "../binary_web.h"
#include "../physics/PhysicsSystem.h"
#include "../physics/Components.h"
#include <entt/entt.hpp>
#include <vector>

struct PhysicsSyncPayload {
    uint32_t entity_id;
    float x, y, z;
    float rx, ry, rz, rw;
} __attribute__((packed));

struct PhysicsMoveRequest {
    uint32_t entity_id;
    float x, y, z;
} __attribute__((packed));

extern std::mutex registry_mutex;

class PhysicsController {
public:
    static void register_routes(BinaryServer& server, entt::registry& registry, PhysicsSystem& physics) {
        // Move Entity 'M' - Interpret as input direction
        server.register_command('M', "MoveEntity", sizeof(uint32_t), "u32,f32,f32,f32", "u32", [&registry, &physics](const std::string& input) {
            if (input.size() < sizeof(PhysicsMoveRequest)) return std::string("\0\0\0\0", 4);
            
            const auto* req = reinterpret_cast<const PhysicsMoveRequest*>(input.data());
            auto entity = (entt::entity)req->entity_id;
            
            std::lock_guard<std::mutex> lock(registry_mutex);
            if (registry.valid(entity) && registry.all_of<PhysicsComponent>(entity)) {
                auto &phys = registry.get<PhysicsComponent>(entity);
                auto &bi = physics.GetBodyInterface();
                
                // Increase speed and allow some momentum
                float speed = 8.0f;
                JPH::Vec3 current_vel = bi.GetLinearVelocity(phys.body_id);
                
                // When moving, we set the target X/Z velocity but preserve the Y velocity
                // We also wake the body up
                JPH::Vec3 target_vel(req->x * speed, current_vel.GetY(), req->z * speed);
                
                bi.SetLinearVelocity(phys.body_id, target_vel);
                bi.ActivateBody(phys.body_id); 
                
                uint32_t status = 1;
                return std::string(reinterpret_cast<const char*>(&status), 4);
            } else {
                printf("[Physics] Input rejected: invalid entity %d\n", req->entity_id);
            }
            
            uint32_t status = 0;
            return std::string(reinterpret_cast<const char*>(&status), 4);
        });

        // Stream World State 'W'
        server.register_stream('W', "WorldStream", sizeof(PhysicsSyncPayload), "world_state", [&registry]() {
            std::lock_guard<std::mutex> lock(registry_mutex);
            auto view = registry.view<TransformComponent>();
            std::vector<PhysicsSyncPayload> updates;
            
            for (auto entity : view) {
                auto &trans = view.get<TransformComponent>(entity);
                PhysicsSyncPayload p;
                p.entity_id = (uint32_t)entity;
                p.x = trans.x; p.y = trans.y; p.z = trans.z;
                p.rx = trans.rx; p.ry = trans.ry; p.rz = trans.rz; p.rw = trans.rw;
                updates.push_back(p);
            }

            if (updates.empty()) return std::string("");

            // Return as raw binary blob
            return std::string(reinterpret_cast<const char*>(updates.data()), updates.size() * sizeof(PhysicsSyncPayload));
        });
    }
};

#endif
