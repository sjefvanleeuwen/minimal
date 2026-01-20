#include <iostream>
#include <chrono>
#include <vector>
#include "../physics/PhysicsSystem.h"
#include "../physics/Components.h"
#include "../controllers/PhysicsController.h"
#include <entt/entt.hpp>

// Define missing globals that PhysicsController expects
std::mutex registry_mutex;

void run_benchmark(int entity_count) {
    std::cout << "\n[Benchmark] Testing with " << entity_count << " active entities..." << std::endl;
    
    PhysicsSystem physics;
    entt::registry registry;
    
    // 1. Setup Environment
    physics.CreateBox(JPH::Vec3(0, -1, 0), JPH::Vec3(100, 1, 100), JPH::EMotionType::Static, Layers::NON_MOVING);
    
    // 2. Spawn Entities
    auto start_spawn = std::chrono::steady_clock::now();
    for (int i = 0; i < entity_count; i++) {
        auto entity = registry.create();
        float x = (float)(rand() % 100) - 50.0f;
        float z = (float)(rand() % 100) - 50.0f;
        
        auto body_id = physics.CreateSphere(JPH::Vec3(x, 10.0f + (i * 0.1f), z), 1.0f, JPH::EMotionType::Dynamic, Layers::MOVING);
        registry.emplace<PhysicsComponent>(entity, body_id);
    }
    auto end_spawn = std::chrono::steady_clock::now();
    auto spawn_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_spawn - start_spawn).count();
    std::cout << "  - Spawned " << entity_count << " spheres in " << spawn_ms << "ms" << std::endl;

    // 3. Physics Step Benchmark
    const int steps = 100;
    auto start_physics = std::chrono::steady_clock::now();
    for (int i = 0; i < steps; i++) {
        physics.Step(1.0f / 60.0f);
    }
    auto end_physics = std::chrono::steady_clock::now();
    auto physics_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_physics - start_physics).count();
    double avg_physics_ms = (double)physics_ms / steps;
    
    std::cout << "  - Physics Step (Avg): " << avg_physics_ms << "ms (" << (avg_physics_ms > 16.66 ? "FAIL > 60Hz" : "PASS") << ")" << std::endl;

    // 4. ECS Sync & Payload Generation Benchmark
    auto start_sync = std::chrono::steady_clock::now();
    for (int i = 0; i < steps; i++) {
        std::vector<PhysicsSyncPayload> sync_data;
        sync_data.reserve(entity_count);
        
        auto& bi = physics.GetBodyInterface();
        auto view = registry.view<PhysicsComponent>();
        for (auto entity : view) {
            auto& phys = view.get<PhysicsComponent>(entity);
            JPH::Vec3 pos = bi.GetPosition(phys.body_id);
            JPH::Quat rot = bi.GetRotation(phys.body_id);
            
            PhysicsSyncPayload p;
            p.entity_id = (uint32_t)entity;
            p.x = pos.GetX(); p.y = pos.GetY(); p.z = pos.GetZ();
            p.rx = rot.GetX(); p.ry = rot.GetY(); p.rz = rot.GetZ(); p.rw = rot.GetW();
            sync_data.push_back(p);
        }
        
        // Simulate string serialization
        std::string payload(reinterpret_cast<const char*>(sync_data.data()), sync_data.size() * sizeof(PhysicsSyncPayload));
    }
    auto end_sync = std::chrono::steady_clock::now();
    auto sync_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_sync - start_sync).count();
    double avg_sync_ms = (double)sync_ms / steps;

    std::cout << "  - ECS Sync & Pack (Avg): " << avg_sync_ms << "ms" << std::endl;
    std::cout << "  - Total Tick Budget Used: " << (avg_physics_ms + avg_sync_ms) << "ms / 16.66ms" << std::endl;
    std::cout << "  - Max Recommended Players (Approx): " << (int)(16.66 / (avg_physics_ms + avg_sync_ms) * entity_count) << " items" << std::endl;
}

int main() {
    std::cout << "=== Minimal Binary Server Performance Test ===" << std::endl;
    
    run_benchmark(100);
    run_benchmark(1000);
    run_benchmark(5000);
    
    return 0;
}
