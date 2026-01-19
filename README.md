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

#### Option A: Docker (Recommended)
1. **Build the image:**
   ```bash
   docker build -t minimal-binary .
   ```

2. **Run the container:**
   ```bash
   docker run -p 8081:8081 minimal-binary
   ```

#### Option B: Local Development (Linux or Windows with WSL)
Since the server uses `epoll` for high-performance networking, it requires a Linux environment. On Windows, please use **WSL (Windows Subsystem for Linux)**.

1.  **Install Node.js & Dependencies (WSL/Ubuntu):**
    If you don't have Node.js or pnpm installed in WSL, run:
    ```bash
    # Install Node.js 22
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs

    # Install pnpm & build tools
    sudo npm install -g pnpm
    sudo apt install -y build-essential cmake
    ```

2.  **Build and Run the Server:**
    ```bash
    pnpm server:build
    pnpm server:run
    ```

3.  **Run the Frontend (in a separate terminal):**
    ```bash
    pnpm dev
    ```

### Project Automation
The root `package.json` contains helper scripts:
- `pnpm server:build`: Compiles the C++ server using CMake.
- `pnpm server:run`: Execution of the compiled binary.
- `pnpm dev`: Starts the webview in watch mode.
- `pnpm build`: Full project build via Turbo.

## Technical Details
- **Binary Format:** 
    - `uint32_t date` (4 bytes)
    - `int32_t temp_c` (4 bytes)
    - `char summary[16]` (16 bytes)
- **Image Size:** ~150kB.
