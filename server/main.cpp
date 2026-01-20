#include "BinaryServer.h"
#include "controllers/TestController.h"
#include "controllers/UserController.h"
#include "physics/PhysicsSystem.h"
#include "physics/Components.h"
#include "controllers/PhysicsController.h"
#include "scene/SceneManager.h"
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

    // Start Physics Thread (60Hz)
    std::thread physics_thread([&]() {
        auto last_time = std::chrono::steady_clock::now();
        while (running) {
            auto now = std::chrono::steady_clock::now();
            last_time = now;

            // Apply inputs as forces before stepping
            {
                std::lock_guard<std::mutex> lock(registry_mutex);
                auto view = registry.view<PhysicsComponent, InputComponent>();
                auto &bi = physics.GetBodyInterface();
                for (auto ent : view) {
                    auto &phys = view.get<PhysicsComponent>(ent);
                    auto &inp = view.get<InputComponent>(ent);
                    
                    if (inp.dx != 0 || inp.dz != 0) {
                        float force_magnitude = 25000.0f; // Enough to move a ~4 ton ball
                        bi.AddForce(phys.body_id, JPH::Vec3(inp.dx * force_magnitude, 0, inp.dz * force_magnitude));
                        bi.ActivateBody(phys.body_id);
                    }
                }
            }

            physics.Step(1.0f / 60.0f); // Fixed step for AAA stability

            // Sync physics back to ECS and check for "fell off world"
            {
                std::lock_guard<std::mutex> lock(registry_mutex);
                auto view = registry.view<PhysicsComponent, TransformComponent>();
                auto &bi = physics.GetBodyInterface();
                for (auto ent : view) {
                    auto &phys = view.get<PhysicsComponent>(ent);
                    auto &trans = view.get<TransformComponent>(ent);
                    
                    JPH::Vec3 pos = bi.GetPosition(phys.body_id);
                    
                    // Respawn if fell off (Y < -10)
                    if (pos.GetY() < -10.0f) {
                        bi.SetPosition(phys.body_id, JPH::Vec3(0, 5, 0), JPH::EActivation::Activate);
                        bi.SetLinearVelocity(phys.body_id, JPH::Vec3::sZero());
                        bi.SetAngularVelocity(phys.body_id, JPH::Vec3::sZero());
                        pos = JPH::Vec3(0, 5, 0);
                    }

                    JPH::Quat rot = bi.GetRotation(phys.body_id);
                    
                    trans.x = pos.GetX(); trans.y = pos.GetY(); trans.z = pos.GetZ();
                    trans.rx = rot.GetX(); trans.ry = rot.GetY(); trans.rz = rot.GetZ(); trans.rw = rot.GetW();
                }
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(16));
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
    PhysicsController::register_routes(binary_node, registry, physics, scene_manager);

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
