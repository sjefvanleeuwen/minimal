#ifndef PHYSICS_SYSTEM_H
#define PHYSICS_SYSTEM_H

// Jolt Physics Includes
#include <Jolt/Jolt.h>
#include <Jolt/RegisterTypes.h>
#include <Jolt/Core/Factory.h>
#include <Jolt/Core/TempAllocator.h>
#include <Jolt/Core/JobSystemThreadPool.h>
#include <Jolt/Physics/PhysicsSettings.h>
#include <Jolt/Physics/PhysicsSystem.h>
#include <Jolt/Physics/Collision/Shape/BoxShape.h>
#include <Jolt/Physics/Collision/Shape/SphereShape.h>
#include <Jolt/Physics/Body/BodyCreationSettings.h>
#include <Jolt/Physics/Body/BodyActivationListener.h>

#include <iostream>
#include <vector>

// Layer definitions
namespace Layers {
    static constexpr JPH::ObjectLayer NON_MOVING = 0;
    static constexpr JPH::ObjectLayer MOVING = 1;
    static constexpr JPH::ObjectLayer NUM_LAYERS = 2;
}

// Broad phase layers
namespace BroadPhaseLayers {
    static constexpr JPH::BroadPhaseLayer NON_MOVING(0);
    static constexpr JPH::BroadPhaseLayer MOVING(1);
    static constexpr uint32_t NUM_LAYERS = 2;
}

// Map Object Layer to Broad Phase Layer
class BPLayerInterfaceImpl final : public JPH::BroadPhaseLayerInterface {
public:
    BPLayerInterfaceImpl() {
        mObjectToBroadPhase[Layers::NON_MOVING] = BroadPhaseLayers::NON_MOVING;
        mObjectToBroadPhase[Layers::MOVING] = BroadPhaseLayers::MOVING;
    }
    virtual uint32_t GetNumBroadPhaseLayers() const override { return BroadPhaseLayers::NUM_LAYERS; }
    virtual JPH::BroadPhaseLayer GetBroadPhaseLayer(JPH::ObjectLayer inLayer) const override { return mObjectToBroadPhase[inLayer]; }
#if defined(JPH_EXTERNAL_PROFILE) || defined(JPH_PROFILE_ENABLED)
    virtual const char* GetBroadPhaseLayerName(JPH::BroadPhaseLayer inLayer) const override {
        switch ((JPH::BroadPhaseLayer::Type)inLayer) {
            case (JPH::BroadPhaseLayer::Type)BroadPhaseLayers::NON_MOVING: return "NON_MOVING";
            case (JPH::BroadPhaseLayer::Type)BroadPhaseLayers::MOVING: return "MOVING";
            default: return "INVALID";
        }
    }
#endif
private:
    JPH::BroadPhaseLayer mObjectToBroadPhase[Layers::NUM_LAYERS];
};

class ObjectVsBroadPhaseLayerFilterImpl : public JPH::ObjectVsBroadPhaseLayerFilter {
public:
    virtual bool ShouldCollide(JPH::ObjectLayer inLayer1, JPH::BroadPhaseLayer inLayer2) const override {
        switch (inLayer1) {
            case Layers::NON_MOVING: return inLayer2 == BroadPhaseLayers::MOVING;
            case Layers::MOVING: return true;
            default: return false;
        }
    }
};

class ObjectLayerPairFilterImpl : public JPH::ObjectLayerPairFilter {
public:
    virtual bool ShouldCollide(JPH::ObjectLayer inObject1, JPH::ObjectLayer inObject2) const override {
        switch (inObject1) {
            case Layers::NON_MOVING: return inObject2 == Layers::MOVING;
            case Layers::MOVING: return true;
            default: return false;
        }
    }
};

class PhysicsSystem {
public:
    PhysicsSystem() {
        JPH::RegisterDefaultAllocator();
        JPH::Factory::sInstance = new JPH::Factory();
        JPH::RegisterTypes();

        temp_allocator = new JPH::TempAllocatorImpl(10 * 1024 * 1024);
        job_system = new JPH::JobSystemThreadPool(JPH::cMaxPhysicsJobs, JPH::cMaxPhysicsBarriers, std::thread::hardware_concurrency() - 1);

        physics_system.Init(cMaxBodies, cMaxBodyMutexes, cMaxMaxBodyPairs, cMaxContactConstraints, 
                            bp_layer_interface, obj_vs_bp_filter, obj_vs_obj_filter);
    }

    ~PhysicsSystem() {
        delete job_system;
        delete temp_allocator;
        delete JPH::Factory::sInstance;
    }

    void Step(float delta_time) {
        // We step with a fixed frequency of 60Hz
        physics_system.Update(delta_time, 1, temp_allocator, job_system);
    }

    JPH::BodyID CreateSphere(JPH::Vec3 position, float radius, JPH::EMotionType motion_type, JPH::ObjectLayer layer) {
        JPH::BodyInterface &body_interface = physics_system.GetBodyInterface();
        JPH::SphereShapeSettings shape_settings(radius);
        JPH::ShapeSettings::ShapeResult result = shape_settings.Create();
        JPH::ShapeRefC shape = result.Get();

        JPH::BodyCreationSettings settings(shape, position, JPH::Quat::sIdentity(), motion_type, layer);
        JPH::BodyID body_id = body_interface.CreateAndAddBody(settings, JPH::EActivation::Activate);
        return body_id;
    }

    JPH::BodyID CreateBox(JPH::Vec3 position, JPH::Vec3 half_extent, JPH::EMotionType motion_type, JPH::ObjectLayer layer, JPH::Quat rotation = JPH::Quat::sIdentity()) {
        JPH::BodyInterface &body_interface = physics_system.GetBodyInterface();
        JPH::BoxShapeSettings shape_settings(half_extent);
        JPH::ShapeSettings::ShapeResult result = shape_settings.Create();
        JPH::ShapeRefC shape = result.Get();

        JPH::BodyCreationSettings settings(shape, position, rotation, motion_type, layer);
        JPH::BodyID body_id = body_interface.CreateAndAddBody(settings, JPH::EActivation::Activate);
        return body_id;
    }

    JPH::BodyInterface& GetBodyInterface() { return physics_system.GetBodyInterface(); }

private:
    static constexpr uint32_t cMaxBodies = 1024;
    static constexpr uint32_t cMaxBodyMutexes = 0;
    static constexpr uint32_t cMaxMaxBodyPairs = 1024;
    static constexpr uint32_t cMaxContactConstraints = 1024;

    JPH::PhysicsSystem physics_system;
    JPH::TempAllocatorImpl* temp_allocator;
    JPH::JobSystemThreadPool* job_system;

    BPLayerInterfaceImpl bp_layer_interface;
    ObjectVsBroadPhaseLayerFilterImpl obj_vs_bp_filter;
    ObjectLayerPairFilterImpl obj_vs_obj_filter;
};

#endif
