cmake_minimum_required(VERSION 3.10)
project(MinimalBinaryServer)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Download SQLite3 if not present
include(FetchContent)
FetchContent_Declare(
    sqlite3
    URL https://www.sqlite.org/2024/sqlite-amalgamation-3470100.zip
)
FetchContent_MakeAvailable(sqlite3)

# Add SQLite3 library
add_library(sqlite3_lib STATIC ${sqlite3_SOURCE_DIR}/sqlite3.c)
target_include_directories(sqlite3_lib PUBLIC ${sqlite3_SOURCE_DIR})
if(UNIX)
    target_link_libraries(sqlite3_lib PUBLIC pthread dl)
endif()

# The Server Executable
add_executable(server 
    main.cpp
    binary_web.h
    controllers/TestController.h
    controllers/UserController.h
)

target_include_directories(server PRIVATE ${sqlite3_SOURCE_DIR} .)
target_link_libraries(server PRIVATE sqlite3_lib)

if(MSVC)
    target_compile_options(server PRIVATE /W4)
else()
    target_compile_options(server PRIVATE -Wall -Wextra -Os)
endif()
