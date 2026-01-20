#include <iostream>
#include <vector>
#include <string>
#include <thread>
#include <atomic>
#include <chrono>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#include <string.h>

// Simple mock of the broadcast payload
std::string create_mock_payload(int entities) {
    struct Dummy { uint32_t id; float x, y, z, rx, ry, rz, rw; };
    std::vector<Dummy> data(entities);
    return std::string(reinterpret_cast<const char*>(data.data()), data.size() * sizeof(Dummy));
}

struct ClientStats {
    std::atomic<size_t> bytes_received{0};
    std::atomic<size_t> messages_received{0};
    std::atomic<long long> last_latency_ns{0};
};

void run_client(int port, int client_id, ClientStats& stats, std::atomic<bool>& running) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return;

    struct sockaddr_in addr;
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    if (connect(fd, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(fd);
        return;
    }

    // Handshake for 'W' stream
    std::string handshake = 
        "GET /W HTTP/1.1\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n";
    send(fd, handshake.data(), handshake.size(), 0);

    char buffer[65536];
    // Read handshake response
    ssize_t h_bytes = recv(fd, buffer, sizeof(buffer) - 1, 0);
    if (h_bytes > 0) {
        buffer[h_bytes] = '\0';
        std::cout << "[Client " << client_id << "] Handshake response: " << (h_bytes > 50 ? "OK" : "Error") << std::endl;
    } else {
        std::cerr << "[Client " << client_id << "] Failed to receive handshake response" << std::endl;
        close(fd);
        return;
    }

    struct timeval timeout;
    timeout.tv_sec = 1;
    timeout.tv_usec = 0;
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));

    while (running) {
        ssize_t n = recv(fd, buffer, sizeof(buffer), 0);
        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
            break;
        }
        if (n == 0) break;

        stats.bytes_received += n;
        stats.messages_received++;
    }
    close(fd);
}

int main(int argc, char** argv) {
    int num_clients = (argc > 1) ? std::stoi(argv[1]) : 50;
    int duration_sec = 5;

    std::cout << "=== Socket Stress Test: " << num_clients << " clients ===" << std::endl;
    
    std::vector<std::thread> clients;
    std::vector<ClientStats*> client_stats;
    std::atomic<bool> running{true};

    for (int i = 0; i < num_clients; i++) {
        auto* s = new ClientStats();
        client_stats.push_back(s);
        clients.emplace_back(run_client, 8081, i, std::ref(*s), std::ref(running));
    }

    std::cout << "[Test] Clients connected. Measuring throughput for " << duration_sec << "s..." << std::endl;
    
    auto start = std::chrono::steady_clock::now();
    for (int i = 0; i < duration_sec; i++) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        std::cout << "  " << (i + 1) << "s..." << std::endl;
    }
    
    running = false;
    std::cout << "[Test] Shutting down clients..." << std::endl;
    for (auto& t : clients) {
        if (t.joinable()) t.join();
    }

    size_t total_bytes = 0;
    size_t total_msgs = 0;
    for (auto* s : client_stats) {
        total_bytes += s->bytes_received;
        total_msgs += s->messages_received;
        delete s;
    }

    auto end = std::chrono::steady_clock::now();
    double diff = std::chrono::duration<double>(end - start).count();

    std::cout << "\nResults:" << std::endl;
    std::cout << "  - Total Messages: " << total_msgs << std::endl;
    std::cout << "  - Total Throughput: " << (total_bytes / 1024.0 / 1024.0 / diff) << " MB/s" << std::endl;
    std::cout << "  - Avg Msgs/Client/Sec: " << (total_msgs / num_clients / diff) << " (Target: ~60)" << std::endl;

    if ((total_msgs / num_clients / diff) < 55.0) {
        std::cout << "  - [RESULT] FAIL: Jitter or congestion detected." << std::endl;
    } else {
        std::cout << "  - [RESULT] PASS: Smooth 60Hz delivery." << std::endl;
    }

    return 0;
}
