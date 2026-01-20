#include "BinaryServer.h"
#include "controllers/TestController.h"
#include "controllers/UserController.h"
#include "physics/PhysicsSystem.h"
#include "physics/Components.h"
#include "controllers/PhysicsController.h"
#include "scene/SceneManager.h"
#include "nodes/CrateNode.h"
#include <chrono>
#include <entt/entt.hpp>
#include <atomic>
#include <mutex>
#include <ctime>

std::mutex registry_mutex;

int main() {
    DbState state;
    if (sqlite3_open("minimal_api.db", &state.db) != SQLITE_OK) {
        return 1;
    }
    srand(time(nullptr));

    // Initialize Physics & ECS
    PhysicsSystem physics;
    entt::registry registry;
    std::atomic<bool> running{true};
    SharedWorldState world_state;

    // Load scene from configuration
    SceneManager scene_manager;
    if (!scene_manager.load_from_file("server/scene/default.json")) {
        printf("[Main] Failed to load scene configuration from server/scene/default.json, trying scene/default.json fallback...\n");
        if (!scene_manager.load_from_file("scene/default.json")) {
            printf("[Main] Failed to load any scene configuration, using defaults\n");
            // Fallback: create default ground plane
            physics.CreateBox(JPH::Vec3(0, -1, 0), JPH::Vec3(100, 1, 100), JPH::EMotionType::Static, Layers::NON_MOVING);
        } else {
            scene_manager.create_all(physics);
        }
    } else {
        // Create all scene nodes from configuration
        scene_manager.create_all(physics);
    }

    // Create a crate wall (10 wide, 1 deep, 5 high)
    CrateNode::create_stack(registry, physics, JPH::Vec3(-5, 0, 10), 10, 1, 5);

    // Start Physics Thread (60Hz)
    std::thread physics_thread([&]() {
        using clock = std::chrono::steady_clock;
        auto next_tick = clock::now();
        int tick_counter = 0;
        
        while (running) {
            next_tick += std::chrono::nanoseconds(1000000000 / 60); // Precise 60Hz

            // 1. Gather inputs
            struct InputSnapshot { entt::entity entity; JPH::BodyID body_id; float dx, dz; };
            std::vector<InputSnapshot> inputs;
            {
                std::lock_guard<std::mutex> lock(registry_mutex);
                auto view = registry.view<PhysicsComponent, InputComponent>();
                for (auto ent : view) {
                    auto &phys = view.get<PhysicsComponent>(ent);
                    auto &inp = view.get<InputComponent>(ent);
                    if (inp.dx != 0 || inp.dz != 0) {
                        inputs.push_back({ent, phys.body_id, inp.dx, inp.dz});
                    }
                }
            }

            // 2. Apply forces
            auto &bi = physics.GetBodyInterface();
            for (auto &in : inputs) {
                float force_magnitude = 25000.0f;
                bi.AddForce(in.body_id, JPH::Vec3(in.dx * force_magnitude, 0, in.dz * force_magnitude));
                bi.ActivateBody(in.body_id);
            }

            // 3. Step physics simulation (Done OUTSIDE the registry lock)
            physics.Step(1.0f / 60.0f);

            // 4. Sync back to ECS
            struct SyncUpdate { entt::entity entity; float x, y, z, rx, ry, rz, rw; };
            std::vector<SyncUpdate> updates;
            std::vector<PhysicsSyncPayload> stream_payloads;

            {
                std::lock_guard<std::mutex> lock(registry_mutex);
                auto view = registry.view<PhysicsComponent, TransformComponent>();
                for (auto ent : view) {
                    auto &phys = view.get<PhysicsComponent>(ent);
                    JPH::Vec3 pos = bi.GetPosition(phys.body_id);
                    
                    if (pos.GetY() < -10.0f) {
                        bi.SetPosition(phys.body_id, JPH::Vec3(0, 5, 0), JPH::EActivation::Activate);
                        bi.SetLinearVelocity(phys.body_id, JPH::Vec3::sZero());
                        bi.SetAngularVelocity(phys.body_id, JPH::Vec3::sZero());
                        pos = JPH::Vec3(0, 5, 0);
                    }

                    JPH::Quat rot = bi.GetRotation(phys.body_id);
                    updates.push_back({ent, pos.GetX(), pos.GetY(), pos.GetZ(), rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()});
                    
                    // Only stream entities that are currently active in Jolt
                    // This dramatically reduces bandwidth for stable/stacked boxes
                    if (bi.IsActive(phys.body_id)) {
                        PhysicsSyncPayload p;
                        p.entity_id = (uint32_t)ent;
                        p.x = pos.GetX(); p.y = pos.GetY(); p.z = pos.GetZ();
                        p.rx = rot.GetX(); p.ry = rot.GetY(); p.rz = rot.GetZ(); p.rw = rot.GetW();
                        stream_payloads.push_back(p);
                    }
                }

                for (const auto& u : updates) {
                    auto &trans = registry.get<TransformComponent>(u.entity);
                    trans.x = u.x; trans.y = u.y; trans.z = u.z;
                    trans.rx = u.rx; trans.ry = u.ry; trans.rz = u.rz; trans.rw = u.rw;
                }
            }

            // 5. Push to lockless stream buffer
            if (!stream_payloads.empty()) {
                world_state.update(std::string(reinterpret_cast<const char*>(stream_payloads.data()), stream_payloads.size() * sizeof(PhysicsSyncPayload)));
            }

            // Debug: Log active entity count every 120 ticks (2 seconds)
            if (++tick_counter % 120 == 0) {
                printf("[Main] Streaming %zu active entities (out of %zu total)\n", stream_payloads.size(), updates.size());
            }

            std::this_thread::sleep_until(next_tick);
        }
    });

    // Initialize Schema
    char* errMsg = nullptr;
    sqlite3_exec(state.db, "CREATE TABLE IF NOT EXISTS stats (id INTEGER PRIMARY KEY, hits INTEGER);", nullptr, nullptr, &errMsg);
    sqlite3_exec(state.db, "INSERT INTO stats (id, hits) VALUES (1, 0) ON CONFLICT(id) DO NOTHING;", nullptr, nullptr, &errMsg);
    
    // User Schema
    sqlite3_exec(state.db, "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, email TEXT UNIQUE, password TEXT);", nullptr, nullptr, &errMsg);
    
    // Migrations for existing databases
    sqlite3_exec(state.db, "ALTER TABLE users ADD COLUMN password TEXT;", nullptr, nullptr, nullptr);
    sqlite3_exec(state.db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(name);", nullptr, nullptr, nullptr);
    sqlite3_exec(state.db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);", nullptr, nullptr, nullptr);

    BinaryServer binary_node(8081);
    auto start_time = std::chrono::steady_clock::now();

    // Delegate registrations
    TestController::register_routes(binary_node, state, start_time);
    UserController::register_routes(binary_node, state);
    PhysicsController::register_routes(binary_node, registry, physics, scene_manager, world_state);

    printf("================================================\n");
    printf("   MINIMAL BINARY WEB API - v1.0.0 (MBCS)       \n");
    printf("================================================\n");
    printf("[Status] Core: Raw Binary / ZERO-PARSER         \n");
    printf("[Status] HTTP: Enabled (Hybrid Mode)            \n");
    printf("[Status] Port: 8081                             \n");
    printf("[Status] DB  : SQLite3 (minimal_api.db)         \n");
    printf("------------------------------------------------\n");
    printf("Waiting for commands...\n");

    binary_node.start();
    binary_node.join();

    sqlite3_close(state.db);
    return 0;
}
