# Absolute Minimal C++ Web API Plan

To achieve the smallest possible footprint, we will use **C++ with raw Linux sockets** and static linking against `musl`.

## The Strategy

### 1. The Code (`main.cpp`)
We use raw Unix sockets to avoid any library dependencies. This keeps the binary size extremely low by only including what is strictly necessary to listen on a port and send a string.

### 2. The Build
- **Compiler:** `g++` with `-static` flag.
- **Libc:** `musl` (via Alpine Docker image) to ensure the binary is fully self-contained.
- **Optimization:** `-Os` (Optimize for size) and `-s` (Strip symbols).

### 3. The Dockerfile
A multi-stage build:
1. **Build Stage:** Uses `alpine:latest` to compile the code statically.
2. **Final Stage:** `FROM scratch`. Copies only the resulting binary.

## Footprint Goals
- **Binary Size:** **< 200KB** (uncompressed).
- **Image Size:** Identical to the binary size (~200KB).
- **Memory Usage:** **~1-2MB**.
- **OS Layer:** None.

## Implementation Steps
1. Create `minimal_web.h`: A reusable, header-only HTTP server engine using `epoll` and `std::thread`.
2. Create `main.cpp`: Define endpoints and clear routing logic.
3. Create a multi-stage `Dockerfile` with aggressive LTO and symbol stripping.
4. Build the Docker image.
5. Run and verify the footprint.
