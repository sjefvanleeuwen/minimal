#ifndef PHYSICS_CONTROLLER_H
#define PHYSICS_CONTROLLER_H

#include "../BinaryServer.h"
#include "../physics/PhysicsSystem.h"
#include "../physics/Components.h"
#include "../scene/SceneManager.h"
#include "../nodes/PlayerNode.h"
#include <entt/entt.hpp>
#include <vector>
#include "../core/SharedState.h"

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
    static void register_routes(BinaryServer& server, entt::registry& registry, PhysicsSystem& physics, SceneManager& scene, SharedWorldState& world_state) {
        // Track which player entity belongs to which socket FD
        static std::map<int, entt::entity> fd_to_entity;
        static std::mutex fd_map_mutex;

        // Asset Manifest 'A' - Get the scene configuration
        server.register_command('A', "GetAssets", 0, "", "json", [&scene](int, const std::string& input) {
            return scene.get_raw_json();
        });

        // Get Entities Info 'E' - Returns metadata (colors) for all entities
        server.register_command('E', "GetEntitiesInfo", 0, "", "metadata[]", [&registry](int, const std::string& input) {
            std::lock_guard<std::mutex> lock(registry_mutex);
            auto view = registry.view<ColorComponent>();
            std::vector<EntityMetadata> metas;
            for (auto entity : view) {
                auto &col = view.get<ColorComponent>(entity);
                metas.push_back({(uint32_t)entity, col.r, col.g, col.b, col.a});
            }
            return std::string(reinterpret_cast<const char*>(metas.data()), metas.size() * sizeof(EntityMetadata));
        });

        // Join Game 'J' - Spawn a new player node
        // Associate the joining player with their connection FD
        server.register_command('J', "JoinGame", 0, "", "metadata", [&registry, &physics](int fd, const std::string& input) {
            std::lock_guard<std::mutex> lock(registry_mutex);
            
            auto entity = PlayerNode::create(registry, physics, fd);
            
            // Map the FD to the entity for robust cleanup
            {
                std::lock_guard<std::mutex> fd_lock(fd_map_mutex);
                fd_to_entity[fd] = entity;
                printf("[PhysicsController] Mapped fd %d to player entity %u\n", fd, (uint32_t)entity);
            }

            auto& col = registry.get<ColorComponent>(entity);
            EntityMetadata meta = {(uint32_t)entity, col.r, col.g, col.b, col.a};
            return std::string(reinterpret_cast<const char*>(&meta), sizeof(EntityMetadata));
        });

        // Move Entity 'M' - Update Input State
        server.register_command('M', "MoveEntity", sizeof(uint32_t), "u32,f32,f32,f32", "u32", [&registry, &physics](int fd, const std::string& input) {
            if (input.size() < sizeof(PhysicsMoveRequest)) return std::string("\0\0\0\0", 4);
            
            const auto* req = reinterpret_cast<const PhysicsMoveRequest*>(input.data());
            auto entity = (entt::entity)req->entity_id;
            
            // Robust check: Only allow moving if the entity belongs to this FD
            {
                std::lock_guard<std::mutex> fd_lock(fd_map_mutex);
                if (fd_to_entity.count(fd) && fd_to_entity[fd] != entity) {
                    // Unauthorized move attempt
                    uint32_t status = 0;
                    return std::string(reinterpret_cast<const char*>(&status), 4);
                }
            }

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

        // Stream World State 'W' - Modified to allow FD identification if needed
        server.register_stream('W', "WorldStream", sizeof(PhysicsSyncPayload), "world_state", [&world_state]() {
            return world_state.get();
        });

        // Robust cleanup on disconnect
        server.on_disconnect([&registry, &physics](int fd) {
            std::lock_guard<std::mutex> fd_lock(fd_map_mutex);
            if (fd_to_entity.count(fd)) {
                auto entity = fd_to_entity[fd];
                printf("[PhysicsController] Cleaning up player entity %u for disconnected fd %d\n", (uint32_t)entity, fd);
                
                std::lock_guard<std::mutex> reg_lock(registry_mutex);
                PlayerNode::destroy(registry, physics, entity);
                fd_to_entity.erase(fd);
            }
        });
    }
};

#endif
