#pragma once
#include "../binary_web.h"
#include "sqlite3.h"
#include <cstdint>
#include <string>
#include <cstring>
#include <vector>

struct User {
    uint32_t id;
    char name[16];
    char email[32];
} __attribute__((packed));

class UserController {
public:
    static void register_routes(BinaryServer& node, DbState& state) {
        // CREATE: Register User (ID '4')
        node.register_command('4', "RegisterUser", sizeof(User), "u32:id|c16:name|c32:email", "u32:id|c16:name|c32:email", [&state](const std::string& data) -> std::string {
            if (data.size() < sizeof(User)) return "";
            const User* u = reinterpret_cast<const User*>(data.data());
            
            sqlite3_stmt* stmt;
            sqlite3_prepare_v2(state.db, "INSERT INTO users (name, email) VALUES (?, ?) RETURNING id;", -1, &stmt, nullptr);
            sqlite3_bind_text(stmt, 1, u->name, -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, u->email, -1, SQLITE_TRANSIENT);
            
            User result = *u;
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                result.id = sqlite3_column_int(stmt, 0);
            }
            sqlite3_finalize(stmt);
            
            return std::string(reinterpret_cast<char*>(&result), sizeof(User));
        });

        // READ: Get User (ID '5')
        node.register_command('5', "GetUser", sizeof(User), "u32:id", "u32:id|c16:name|c32:email", [&state](const std::string& data) -> std::string {
            if (data.size() < 4) return "";
            uint32_t id = *reinterpret_cast<const uint32_t*>(data.data());
            
            sqlite3_stmt* stmt;
            sqlite3_prepare_v2(state.db, "SELECT id, name, email FROM users WHERE id = ?;", -1, &stmt, nullptr);
            sqlite3_bind_int(stmt, 1, id);
            
            User result = {0, "", ""};
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                result.id = sqlite3_column_int(stmt, 0);
                std::strncpy(result.name, (const char*)sqlite3_column_text(stmt, 1), 15);
                std::strncpy(result.email, (const char*)sqlite3_column_text(stmt, 2), 31);
            }
            sqlite3_finalize(stmt);
            
            return std::string(reinterpret_cast<char*>(&result), sizeof(User));
        });

        // UPDATE: Update User (ID '6')
        node.register_command('6', "UpdateUser", 2, "u32:id|c16:name|c32:email", "c2:status", [&state](const std::string& data) -> std::string {
            if (data.size() < sizeof(User)) return "ER";
            const User* u = reinterpret_cast<const User*>(data.data());
            
            sqlite3_stmt* stmt;
            sqlite3_prepare_v2(state.db, "UPDATE users SET name = ?, email = ? WHERE id = ?;", -1, &stmt, nullptr);
            sqlite3_bind_text(stmt, 1, u->name, -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, u->email, -1, SQLITE_TRANSIENT);
            sqlite3_bind_int(stmt, 3, u->id);
            
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
            
            return "OK";
        });

        // DELETE: Delete User (ID '7')
        node.register_command('7', "DeleteUser", 2, "u32:id", "c2:status", [&state](const std::string& data) -> std::string {
            if (data.size() < 4) return "ER";
            uint32_t id = *reinterpret_cast<const uint32_t*>(data.data());
            
            sqlite3_stmt* stmt;
            sqlite3_prepare_v2(state.db, "DELETE FROM users WHERE id = ?;", -1, &stmt, nullptr);
            sqlite3_bind_int(stmt, 1, id);
            
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
            
            return "OK";
        });
    }
};
