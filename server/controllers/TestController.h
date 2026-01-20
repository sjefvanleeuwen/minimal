#pragma once
#include "../BinaryServer.h"
#include "sqlite3.h"
#include <cstdint>
#include <chrono>
#include <string>

// Fixed-size binary structs
struct WeatherData {
    uint32_t date;
    int32_t temp_c;
    char summary[16];
};

struct Telemetry {
    uint32_t counter;
    float uptime;
} __attribute__((packed));

struct DbState {
    sqlite3* db;
};

class TestController {
public:
    static void register_routes(BinaryServer& node, DbState& state, std::chrono::steady_clock::time_point start_time) {
        // Register Binary Command '1' (Weather Forecast)
        node.register_command('1', "GetWeatherForecast", sizeof(WeatherData), "", "u32:date|i32:temp|c16:summary", [&state](int, const std::string&) -> std::string {
            sqlite3_exec(state.db, "UPDATE stats SET hits = hits + 1 WHERE id = 1;", nullptr, nullptr, nullptr);
            
            WeatherData data = { 20260120, 22, "Chilly" };
            return std::string(reinterpret_cast<char*>(&data), sizeof(WeatherData));
        });

        // Register Binary Command '2' (System Status)
        node.register_command('2', "GetSystemStatus", 2, "", "c2:status", [](int, const std::string&) -> std::string {
            return "OK";
        });

        // Register Binary Stream '3' (Live Counter)
        static uint32_t count = 0;
        node.register_stream('3', "LiveTelemetry", sizeof(Telemetry), "u32:counter|f32:uptime", [start_time]() -> std::string {
            auto now = std::chrono::steady_clock::now();
            float uptime = std::chrono::duration_cast<std::chrono::seconds>(now - start_time).count();
            Telemetry t = { ++count, uptime };
            return std::string(reinterpret_cast<char*>(&t), sizeof(Telemetry));
        });
    }
};
