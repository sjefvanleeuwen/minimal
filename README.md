# Ultra-Minimal Binary Web API

An extremely high-performance, ultra-minimalist Binary API footprint in a `FROM scratch` Docker image. This version focuses on raw performance by bypassing HTTP and JSON entirely.

## Key Features
- **Absolute Minimal Size:** ~270kB Docker image.
- **Zero-Parser Architecture:** Data is sent as raw C-structs.
- **Microsecond Latency:** No HTTP headers or status strings.
- **Zero OS Overhead:** Runs on `scratch`.

## Project Structure
- `server/main.cpp`: C++ source using raw binary sockets.
- `server/binary_web.h`: Reusable, ultra-fast Raw Binary node.
- `Dockerfile`: Multi-stage build process with aggressive size optimizations.

## Usage
The server listens for incoming TCP connections on port 8081 and immediately responds with a 24-byte binary packet containing the `WeatherData` struct.

### Build and Run

1. **Build the image:**
   ```bash
   docker build -t minimal-binary .
   ```

2. **Run the container:**
   ```bash
   docker run -p 8081:8081 minimal-binary
   ```

## Technical Details
- **Binary Format:** 
    - `uint32_t date` (4 bytes)
    - `int32_t temp_c` (4 bytes)
    - `char summary[16]` (16 bytes)
- **Image Size:** ~150kB.
