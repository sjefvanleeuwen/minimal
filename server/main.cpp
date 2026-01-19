#include "binary_web.h"
#include "controllers/TestController.h"
#include "controllers/UserController.h"
#include <chrono>

int main() {
    DbState state;
    if (sqlite3_open(":memory:", &state.db) != SQLITE_OK) {
        return 1;
    }

    // Initialize Schema
    char* errMsg = nullptr;
    sqlite3_exec(state.db, "CREATE TABLE IF NOT EXISTS stats (id INTEGER PRIMARY KEY, hits INTEGER);", nullptr, nullptr, &errMsg);
    sqlite3_exec(state.db, "INSERT INTO stats (id, hits) VALUES (1, 0) ON CONFLICT(id) DO NOTHING;", nullptr, nullptr, &errMsg);
    
    // User Schema
    sqlite3_exec(state.db, "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT);", nullptr, nullptr, &errMsg);

    BinaryServer binary_node(8081);
    auto start_time = std::chrono::steady_clock::now();

    // Delegate registrations
    TestController::register_routes(binary_node, state, start_time);
    UserController::register_routes(binary_node, state);

    binary_node.start();
    binary_node.join();

    sqlite3_close(state.db);
    return 0;
}
