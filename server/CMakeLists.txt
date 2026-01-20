cmake_minimum_required(VERSION 3.10)
project(MinimalBinaryServer)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Cache dependencies in a stable location (won't re-download/rebuild)
set(FETCHCONTENT_BASE_DIR "${CMAKE_SOURCE_DIR}/_deps_cache" CACHE PATH "Dependencies cache")

# Download dependencies
include(FetchContent)
set(FETCHCONTENT_QUIET ON) # Quiet after first download

# SQLite3
FetchContent_Declare(
    sqlite3
    URL https://www.sqlite.org/2024/sqlite-amalgamation-3470100.zip
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(sqlite3)

# EnTT (Header-only ECS)
# Using URL to avoid Git subbuild issues on some systems
FetchContent_Declare(
    entt
    URL https://github.com/skypjack/entt/archive/refs/tags/v3.14.0.zip
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)

# EnTT is header-only, we don't need to build its tests or tools
set(ENTT_BUILD_TESTING OFF CACHE INTERNAL "")
FetchContent_MakeAvailable(entt)

# Jolt Physics
FetchContent_Declare(
    Jolt
    URL https://github.com/jrouwe/JoltPhysics/archive/refs/tags/v5.2.0.zip
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
    SOURCE_SUBDIR Build
)
set(TARGET_UNIT_TESTS OFF CACHE INTERNAL "")
set(TARGET_SAMPLES OFF CACHE INTERNAL "")
set(TARGET_HELLO_WORLD OFF CACHE INTERNAL "")
set(TARGET_PERFORMANCE_TEST OFF CACHE INTERNAL "")
set(INTERPROCEDURAL_OPTIMIZATION OFF CACHE INTERNAL "") # Disable LTO for faster builds
set(USE_SSE4_1 ON CACHE INTERNAL "")
set(USE_SSE4_2 ON CACHE INTERNAL "")
set(USE_AVX ON CACHE INTERNAL "")
set(GENERATE_DEBUG_SYMBOLS OFF CACHE INTERNAL "")
FetchContent_MakeAvailable(Jolt)

# Add SQLite3 library
add_library(sqlite3_lib STATIC ${sqlite3_SOURCE_DIR}/sqlite3.c)
target_include_directories(sqlite3_lib PUBLIC ${sqlite3_SOURCE_DIR})
if(UNIX)
    target_link_libraries(sqlite3_lib PUBLIC pthread dl)
endif()

# The Server Executable
add_executable(server 
    main.cpp
    BinaryServer.h
    utils/SHA1.h
    core/EndpointContract.h
    controllers/TestController.h
    controllers/UserController.h
    controllers/PhysicsController.h
    scene/SceneManager.h
    scene/SceneNode.h
    scene/GroundNode.h
    scene/RampNode.h
    scene/BoxNode.h
    physics/PhysicsSystem.h
)

target_include_directories(server PRIVATE 
    ${sqlite3_SOURCE_DIR} 
    ${jolt_SOURCE_DIR}
    .
)

target_link_libraries(server PRIVATE 
    sqlite3_lib
    EnTT::EnTT
    Jolt
)

if(MSVC)
    target_compile_options(server PRIVATE /W4)
    target_compile_definitions(server PRIVATE JPH_FLOATING_POINT_EXCEPTIONS_ENABLED)
else()
    target_compile_options(server PRIVATE -Wall -Wextra -Os -msse4.2)
endif()

# Jolt requires one of these to be defined
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_definitions(server PRIVATE JPH_DEBUG)
else()
    target_compile_definitions(server PRIVATE JPH_RELEASE)
endif()

# Performance Test Tool
add_executable(perf_test
    tests/performance.cpp
    physics/PhysicsSystem.h
)

target_include_directories(perf_test PRIVATE 
    ${jolt_SOURCE_DIR}
    .
)

target_link_libraries(perf_test PRIVATE 
    EnTT::EnTT
    Jolt
)

if(NOT MSVC)
    target_compile_options(perf_test PRIVATE -Wall -Wextra -Os -msse4.2)
endif()

if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_definitions(perf_test PRIVATE JPH_DEBUG)
else()
    target_compile_definitions(perf_test PRIVATE JPH_RELEASE)
endif()

# Socket Stress Test
add_executable(socket_test tests/socket_test.cpp)
if(UNIX)
    target_link_libraries(socket_test PRIVATE pthread)
endif()
