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
        // Move Entity 'M' - Update Input State
        server.register_command('M', "MoveEntity", sizeof(uint32_t), "u32,f32,f32,f32", "u32", [&registry](const std::string& input) {
            if (input.size() < sizeof(PhysicsMoveRequest)) return std::string("\0\0\0\0", 4);
            
            const auto* req = reinterpret_cast<const PhysicsMoveRequest*>(input.data());
            auto entity = (entt::entity)req->entity_id;
            
            std::lock_guard<std::mutex> lock(registry_mutex);
            if (registry.valid(entity)) {
                auto &inp = registry.get_or_emplace<InputComponent>(entity);
                inp.dx = req->x;
                inp.dy = req->y;
                inp.dz = req->z;
                
                uint32_t status = 1;
                return std::string(reinterpret_cast<const char*>(&status), 4);
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
