#ifndef PHYSICS_CONTROLLER_H
#define PHYSICS_CONTROLLER_H

#include "../BinaryServer.h"
#include "../physics/PhysicsSystem.h"
#include "../physics/Components.h"
#include "../scene/SceneManager.h"
#include <entt/entt.hpp>
#include <vector>

struct PhysicsSyncPayload {
    uint32_t entity_id;
    float x, y, z;
    float rx, ry, rz, rw;
} __attribute__((packed));

struct EntityMetadata {
    uint32_t entity_id;
    float r, g, b, a;
} __attribute__((packed));

struct PhysicsMoveRequest {
    uint32_t entity_id;
    float x, y, z;
} __attribute__((packed));

extern std::mutex registry_mutex;

class PhysicsController {
public:
    static void register_routes(BinaryServer& server, entt::registry& registry, PhysicsSystem& physics, SceneManager& scene) {
        // Asset Manifest 'A' - Get the scene configuration
        server.register_command('A', "GetAssets", 0, "", "json", [&scene](const std::string& input) {
            return scene.get_raw_json();
        });

        // Get Entities Info 'E' - Returns metadata (colors) for all entities
        server.register_command('E', "GetEntitiesInfo", 0, "", "metadata[]", [&registry](const std::string& input) {
            std::lock_guard<std::mutex> lock(registry_mutex);
            auto view = registry.view<ColorComponent>();
            std::vector<EntityMetadata> metas;
            for (auto entity : view) {
                auto &col = view.get<ColorComponent>(entity);
                metas.push_back({(uint32_t)entity, col.r, col.g, col.b, col.a});
            }
            return std::string(reinterpret_cast<const char*>(metas.data()), metas.size() * sizeof(EntityMetadata));
        });

        // Join Game 'J' - Spawn a new sphere
        server.register_command('J', "JoinGame", 0, "", "metadata", [&registry, &physics](const std::string& input) {
            std::lock_guard<std::mutex> lock(registry_mutex);
            auto entity = registry.create();
            
            // Random color for the sphere
            float r = (float)(rand() % 100) / 100.0f;
            float g = (float)(rand() % 100) / 100.0f;
            float b = (float)(rand() % 100) / 100.0f;
            
            auto body_id = physics.CreateSphere(JPH::Vec3(0, 5, 0), 1.0f, JPH::EMotionType::Dynamic, Layers::MOVING);
            registry.emplace<PhysicsComponent>(entity, body_id);
            registry.emplace<TransformComponent>(entity, 0.0f, 5.0f, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f);
            registry.emplace<InputComponent>(entity, 0.0f, 0.0f, 0.0f);
            registry.emplace<ColorComponent>(entity, r, g, b, 1.0f);
            
            EntityMetadata meta = {(uint32_t)entity, r, g, b, 1.0f};
            return std::string(reinterpret_cast<const char*>(&meta), sizeof(EntityMetadata));
        });

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
            // Use try_lock to avoid blocking the broadcast thread
            std::unique_lock<std::mutex> lock(registry_mutex, std::try_to_lock);
            if (!lock.owns_lock()) {
                return std::string("");  // Skip this frame if registry is busy
            }
            
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
