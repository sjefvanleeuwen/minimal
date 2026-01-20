#pragma once
#include "../BinaryServer.h"
#include "sqlite3.h"
#include <cstdint>
#include <string>
#include <cstring>
#include <vector>

class UserController {
public:
    static std::string read_str(const std::string& data, size_t& offset) {
        if (offset + 4 > data.size()) return "";
        uint32_t len = *reinterpret_cast<const uint32_t*>(data.data() + offset);
        offset += 4;
        if (offset + len > data.size()) return "";
        std::string s = data.substr(offset, len);
        offset += len;
        return s;
    }

    static void write_str(std::string& buf, const std::string& s) {
        uint32_t len = s.size();
        buf.append(reinterpret_cast<char*>(&len), 4);
        buf.append(s);
    }

    static void register_routes(BinaryServer& node, DbState& state) {
        // CREATE: Register User (ID '4')
        node.register_command('4', "RegisterUser", 0, "str:name|str:email|str:password", "u32:id|str:name|str:email", [&state](int, const std::string& data) -> std::string {
            size_t offset = 0;
            std::string name = read_str(data, offset);
            std::string email = read_str(data, offset);
            std::string password = read_str(data, offset);

            if (name.empty() || email.empty()) {
                printf("[Error] Registration failed: Missing name or email\n");
                return "";
            }
            
            sqlite3_stmt* stmt;
            int rc = sqlite3_prepare_v2(state.db, "INSERT INTO users (name, email, password) VALUES (?, ?, ?) RETURNING id;", -1, &stmt, nullptr);
            if (rc != SQLITE_OK) {
                printf("[Error] SQL Prepare failed: %s\n", sqlite3_errmsg(state.db));
                return "";
            }

            sqlite3_bind_text(stmt, 1, name.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, email.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 3, password.c_str(), -1, SQLITE_TRANSIENT);
            
            std::string result;
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                uint32_t rid = sqlite3_column_int(stmt, 0);
                result.append(reinterpret_cast<const char*>(&rid), 4);
                write_str(result, name);
                write_str(result, email);
                printf("[Success] User registered: %s (ID: %u)\n", email.c_str(), rid);
            } else {
                const char* err = sqlite3_errmsg(state.db);
                printf("[Error] Registration failed: %s\n", err);
                
                // Return a specific binary error if duplicate
                if (std::string(err).find("UNIQUE constraint failed") != std::string::npos) {
                    return "DUP"; // 3 bytes for "Duplicate" error
                }
            }
            sqlite3_finalize(stmt);
            return result;
        });

        // LOGIN: Login User (ID 'L')
        node.register_command('L', "Login", 0, "str:email|str:password", "u32:id|str:name", [&state](int, const std::string& data) -> std::string {
            size_t offset = 0;
            std::string email = read_str(data, offset);
            std::string password = read_str(data, offset);

            printf("[Login] Attempt for email: %s\n", email.c_str());

            sqlite3_stmt* stmt;
            int rc = sqlite3_prepare_v2(state.db, "SELECT id, name FROM users WHERE email = ? AND password = ?;", -1, &stmt, nullptr);
            if (rc != SQLITE_OK) {
                printf("[Login] SQL Prepare Error: %s\n", sqlite3_errmsg(state.db));
                return "";
            }

            sqlite3_bind_text(stmt, 1, email.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, password.c_str(), -1, SQLITE_TRANSIENT);

            std::string result;
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                uint32_t rid = sqlite3_column_int(stmt, 0);
                std::string name = (const char*)sqlite3_column_text(stmt, 1);
                result.append(reinterpret_cast<const char*>(&rid), 4);
                write_str(result, name);
                printf("[Login] Success: %s (ID: %u)\n", email.c_str(), rid);
            } else {
                printf("[Login] Failed: Invalid email or password\n");
            }
            sqlite3_finalize(stmt);
            return result;
        });

        // UPDATE: Change Password (ID 'P')
        node.register_command('P', "ChangePassword", 2, "u32:id|str:old_pass|str:new_pass", "c2:status", [&state](int, const std::string& data) -> std::string {
            size_t offset = 0;
            if (data.size() < 4) return "ER";
            uint32_t id = *reinterpret_cast<const uint32_t*>(data.data() + offset);
            offset += 4;
            std::string old_pass = read_str(data, offset);
            std::string new_pass = read_str(data, offset);

            sqlite3_stmt* stmt;
            sqlite3_prepare_v2(state.db, "UPDATE users SET password = ? WHERE id = ? AND password = ?;", -1, &stmt, nullptr);
            sqlite3_bind_text(stmt, 1, new_pass.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_int(stmt, 2, id);
            sqlite3_bind_text(stmt, 3, old_pass.c_str(), -1, SQLITE_TRANSIENT);

            int rc = sqlite3_step(stmt);
            int changes = sqlite3_changes(state.db);
            sqlite3_finalize(stmt);

            return (changes > 0) ? "OK" : "ER";
        });

        // READ: Get User (ID '5')
        node.register_command('5', "GetUser", 0, "u32:id", "u32:id|str:name|str:email", [&state](int, const std::string& data) -> std::string {
            if (data.size() < 4) return "";
            uint32_t id = *reinterpret_cast<const uint32_t*>(data.data());
            
            sqlite3_stmt* stmt;
            sqlite3_prepare_v2(state.db, "SELECT id, name, email FROM users WHERE id = ?;", -1, &stmt, nullptr);
            sqlite3_bind_int(stmt, 1, id);
            
            std::string result;
            if (sqlite3_step(stmt) == SQLITE_ROW) {
                uint32_t rid = sqlite3_column_int(stmt, 0);
                std::string name = (const char*)sqlite3_column_text(stmt, 1);
                std::string email = (const char*)sqlite3_column_text(stmt, 2);
                
                result.append(reinterpret_cast<char*>(&rid), 4);
                write_str(result, name);
                write_str(result, email);
            }
            sqlite3_finalize(stmt);
            return result;
        });

        // UPDATE: Update User (ID '6')
        node.register_command('6', "UpdateUser", 2, "u32:id|str:name|str:email", "c2:status", [&state](int, const std::string& data) -> std::string {
            size_t offset = 0;
            if (data.size() < 4) return "ER";
            uint32_t id = *reinterpret_cast<const uint32_t*>(data.data());
            offset += 4;
            std::string name = read_str(data, offset);
            std::string email = read_str(data, offset);
            
            sqlite3_stmt* stmt;
            sqlite3_prepare_v2(state.db, "UPDATE users SET name = ?, email = ? WHERE id = ?;", -1, &stmt, nullptr);
            sqlite3_bind_text(stmt, 1, name.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_text(stmt, 2, email.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_int(stmt, 3, id);
            
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
            return "OK";
        });

        // DELETE: Delete User (ID '7')
        node.register_command('7', "DeleteUser", 2, "u32:id", "c2:status", [&state](int, const std::string& data) -> std::string {
            if (data.size() < 4) return "ER";
            uint32_t id = *reinterpret_cast<const uint32_t*>(data.data());
            
            sqlite3_stmt* stmt;
            sqlite3_prepare_v2(state.db, "DELETE FROM users WHERE id = ?;", -1, &stmt, nullptr);
            sqlite3_bind_int(stmt, 1, id);
            
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
            
            return "OK";
        });

        // LIST ALL: Debugging helper (ID 'A')
        node.register_command('A', "ListUsers", 0, "", "str:user_list", [&state](int, const std::string&) -> std::string {
            sqlite3_stmt* stmt;
            sqlite3_prepare_v2(state.db, "SELECT id, name, email FROM users;", -1, &stmt, nullptr);
            
            std::string list = "LIST:\n";
            while (sqlite3_step(stmt) == SQLITE_ROW) {
                list += std::to_string(sqlite3_column_int(stmt, 0)) + ": " + 
                        (const char*)sqlite3_column_text(stmt, 1) + " (" + 
                        (const char*)sqlite3_column_text(stmt, 2) + ")\n";
            }
            sqlite3_finalize(stmt);
            
            std::string result;
            write_str(result, list);
            return result;
        });
    }
};
