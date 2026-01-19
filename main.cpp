#include "minimal_web.h"

int main() {
    MinimalServer server(8080);

    server.on_get("/weatherforecast", []() -> Response {
        return { "[{\"date\":\"2026-01-20\",\"temperatureC\":22,\"summary\":\"Chilly\"}]" };
    });

    server.on_get("/swagger.json", []() -> Response {
        return { "{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Minimal Weather API\",\"version\":\"1.0.0\"}}" };
    });

    server.start();
    return 0;
}
