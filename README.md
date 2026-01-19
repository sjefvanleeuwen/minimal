# Minimal C++ Web API

An extremely high-performance, ultra-minimalist Web API footprint in a `FROM scratch` Docker image.

## Key Features
- **Absolute Minimal Size:** ~280kB Docker image.
- **High Performance:** Powered by `epoll` and `SO_REUSEPORT` for microsecond latency.
- **Multi-Core Scaling:** Automatically spawns worker threads equal to the CPU core count.
- **Zero OS Overhead:** Runs on `scratch` (no shell, no OS files, no libraries except the binary itself).
- **Static Linking:** Compiled against `musl-libc` for a self-contained binary.

## Project Structure
- `main.cpp`: C++ source using raw POSIX sockets and `epoll`.
- `Dockerfile`: Multi-stage build process with aggressive size optimizations.
- `plan.md`: The strategy and analysis behind this architecture.
- `swagger.json`: Static OpenAPI 3.0 specification.

## Endpoints
- `GET /weatherforecast`: Returns a JSON list of weather data.
- `GET /swagger.json`: Returns the static API documentation.

## Prerequisites
- [Docker](https://www.docker.com/)

## Build and Run

1. **Build the image:**
   ```bash
   docker build -t minimal-cpp .
   ```

2. **Run the container:**
   ```bash
   docker run -p 8080:8080 minimal-cpp
   ```

3. **Access the API:**
   - Swagger: `http://localhost:8080/swagger.json`
   - Forecast: `http://localhost:8080/weatherforecast`

## Technical Details
- **Compiler Flags:** `-Os`, `-s`, `-static`, `-fno-exceptions`, `-fno-rtti`, `-flto`, `-ffunction-sections`, `-fdata-sections`.
- **Concurrency Model:** Multi-threaded Event Loop (`epoll` + `std::thread`).
- **RAM Footprint:** ~1-2MB at idle.
