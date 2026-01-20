#ifndef BINARY_WEB_H
#define BINARY_WEB_H

#include <string>
#include <sys/socket.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/epoll.h>
#include <thread>
#include <vector>
#include <functional>
#include <map>
#include <set>
#include <mutex>
#include <cstring>
#include <atomic>

struct EndpointContract {
    char id;
    char name[31];
    uint32_t response_size;
    uint32_t type; // 0: Request-Response, 1: Streaming (WebSocket)
    char request_schema[44];
    char response_schema[44];
} __attribute__((packed));

class BinaryServer {
private:
    std::string sha1_ws(const std::string& input) {
        uint32_t hs[] = {0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0};
        std::string msg = input;
        uint64_t bl = msg.size() * 8;
        msg += (char)0x80;
        while ((msg.size() + 8) % 64 != 0) msg += (char)0x00;
        for (int i = 7; i >= 0; i--) msg += (char)((bl >> (i * 8)) & 0xff);
        for (size_t i = 0; i < msg.size(); i += 64) {
            uint32_t w[80];
            for (int j = 0; j < 16; j++) w[j] = (uint8_t)msg[i + j * 4] << 24 | (uint8_t)msg[i + j * 4 + 1] << 16 | (uint8_t)msg[i + j * 4 + 2] << 8 | (uint8_t)msg[i + j * 4 + 3];
            for (int j = 16; j < 80; j++) { uint32_t v = w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16]; w[j] = (v << 1) | (v >> 31); }
            uint32_t a = hs[0], b = hs[1], c = hs[2], d = hs[3], e = hs[4];
            for (int j = 0; j < 80; j++) {
                uint32_t f, k;
                if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
                else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
                else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
                else { f = b ^ c ^ d; k = 0xca62c1d6; }
                uint32_t t = ((a << 5) | (a >> 27)) + f + e + k + w[j];
                e = d; d = c; c = (b << 30) | (b >> 2); b = a; a = t;
            }
            hs[0] += a; hs[1] += b; hs[2] += c; hs[3] += d; hs[4] += e;
        }
        uint8_t dig[20];
        for (int i = 0; i < 5; i++) { 
            dig[i*4]=hs[i]>>24; dig[i*4+1]=hs[i]>>16; dig[i*4+2]=hs[i]>>8; dig[i*4+3]=hs[i]; 
        }
        
        const char* b64_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        std::string res;
        for (int i = 0; i < 20; i += 3) {
            uint32_t val = (dig[i] << 16) | ((i + 1 < 20 ? dig[i+1] : 0) << 8) | (i + 2 < 20 ? dig[i+2] : 0);
            res += b64_chars[(val >> 18) & 0x3F];
            res += b64_chars[(val >> 12) & 0x3F];
            res += (i + 1 < 20) ? b64_chars[(val >> 6) & 0x3F] : '=';
            res += (i + 2 < 20) ? b64_chars[val & 0x3F] : '=';
        }
        return res;
    }

public:
    BinaryServer(int port) : port(port) {}

    void register_command(char command_id, const char* name, uint32_t size, const char* req_schema, const char* res_schema, std::function<std::string(const std::string&)> handler) {
        commands[command_id] = handler;
        add_contract(command_id, name, size, req_schema, res_schema, 0);
    }

    void register_stream(char command_id, const char* name, uint32_t size, const char* schema, std::function<std::string()> handler) {
        streams[command_id] = handler;
        add_contract(command_id, name, size, "", schema, 1);
    }

    void start() {
        int threads_count = std::thread::hardware_concurrency();
        if (threads_count == 0) threads_count = 1;

        for (int i = 0; i < threads_count; i++) {
            workers.emplace_back(&BinaryServer::run_worker, this);
        }
        
        // Start single broadcast thread for all stream clients
        broadcast_running = true;
        broadcast_thread = std::thread(&BinaryServer::run_broadcast, this);
    }

    void join() {
        // Wait for workers first (they run forever until server shutdown)
        for (auto& t : workers) {
            if (t.joinable()) t.join();
        }
        // Only stop broadcast thread after workers exit (during shutdown)
        broadcast_running = false;
        if (broadcast_thread.joinable()) broadcast_thread.join();
    }

private:
    int port;
    std::map<char, std::function<std::string(const std::string&)>> commands;
    std::map<char, std::function<std::string()>> streams;
    std::vector<std::thread> workers;
    std::vector<EndpointContract> contract_list;
    
    // Stream broadcast infrastructure
    std::mutex stream_clients_mutex;
    std::map<char, std::set<int>> stream_clients;  // cmd_id -> set of client fds
    std::atomic<bool> broadcast_running{false};
    std::thread broadcast_thread;

    void add_contract(char id, const char* name, uint32_t size, const char* req_schema, const char* res_schema, uint32_t type) {
        EndpointContract contract;
        std::memset(&contract, 0, sizeof(EndpointContract));
        contract.id = id;
        std::strncpy(contract.name, name, 30);
        contract.response_size = size;
        contract.type = type;
        std::strncpy(contract.request_schema, req_schema, 43);
        std::strncpy(contract.response_schema, res_schema, 43);
        contract_list.push_back(contract);
    }

    // Single broadcast thread handles all stream clients - no per-client threads
    void run_broadcast() {
        printf("[Server] Broadcast thread started, tracking %zu stream types\n", streams.size());
        int tick = 0;
        while (broadcast_running) {
            tick++;
            // For each stream type, get data once and broadcast to all clients
            for (auto& [cmd_id, handler] : streams) {
                // Get snapshot of client fds (quick lock)
                std::vector<int> clients_snapshot;
                {
                    std::lock_guard<std::mutex> lock(stream_clients_mutex);
                    auto it = stream_clients.find(cmd_id);
                    if (it != stream_clients.end() && !it->second.empty()) {
                        clients_snapshot.assign(it->second.begin(), it->second.end());
                    }
                }
                
                if (clients_snapshot.empty()) continue;  // No clients, skip this stream
                
                // Get payload (this may lock registry_mutex, but we're not holding stream_clients_mutex)
                std::string payload = handler();
                if (payload.empty()) {
                    if (tick % 60 == 0) {
                        printf("[Server] Stream %c has %zu clients but empty payload\n", cmd_id, clients_snapshot.size());
                    }
                    continue;
                }
                
                if (tick % 60 == 0) {
                    printf("[Server] Broadcasting %zu bytes to %zu clients for stream %c\n", 
                           payload.size(), clients_snapshot.size(), cmd_id);
                }

                // Build WebSocket frame once
                std::vector<unsigned char> frame;
                frame.push_back(0x82); // Binary frame
                if (payload.size() <= 125) {
                    frame.push_back((unsigned char)payload.size());
                } else {
                    frame.push_back(126); // 16-bit length
                    frame.push_back((unsigned char)((payload.size() >> 8) & 0xFF));
                    frame.push_back((unsigned char)(payload.size() & 0xFF));
                }

                // Broadcast to all clients (no lock held during sends!)
                std::vector<int> dead_clients;
                for (int fd : clients_snapshot) {
                    // Non-blocking send - drop if client can't keep up
                    ssize_t sent = send(fd, frame.data(), frame.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
                    if (sent <= 0) {
                        dead_clients.push_back(fd);
                        continue;
                    }
                    sent = send(fd, payload.data(), payload.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
                    if (sent <= 0) {
                        dead_clients.push_back(fd);
                    }
                }

                // Clean up dead clients (quick lock)
                if (!dead_clients.empty()) {
                    std::lock_guard<std::mutex> lock(stream_clients_mutex);
                    auto it = stream_clients.find(cmd_id);
                    if (it != stream_clients.end()) {
                        for (int fd : dead_clients) {
                            it->second.erase(fd);
                            close(fd);
                            printf("[Server] Removed dead stream client fd=%d\n", fd);
                        }
                    }
                }
            }
            
            std::this_thread::sleep_for(std::chrono::milliseconds(16)); // ~60Hz broadcast
        }
        printf("[Server] Broadcast thread stopped\n");
    }

    void set_nonblocking(int fd) {
        int flags = fcntl(fd, F_GETFL, 0);
        fcntl(fd, F_SETFL, flags | O_NONBLOCK);
    }

    void run_worker() {
        int server_fd = socket(AF_INET, SOCK_STREAM, 0);
        int opt = 1;
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));
        setsockopt(server_fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt));

        struct sockaddr_in address;
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = INADDR_ANY;
        address.sin_port = htons(port);

        bind(server_fd, (struct sockaddr *)&address, sizeof(address));
        listen(server_fd, 100);
        set_nonblocking(server_fd);

        int epoll_fd = epoll_create1(0);
        struct epoll_event ev, events[64];
        ev.events = EPOLLIN;
        ev.data.fd = server_fd;
        epoll_ctl(epoll_fd, EPOLL_CTL_ADD, server_fd, &ev);

        while (true) {
            int nfds = epoll_wait(epoll_fd, events, 64, -1);
            for (int n = 0; n < nfds; ++n) {
                if (events[n].data.fd == server_fd) {
                    int client_fd = accept(server_fd, nullptr, nullptr);
                    if (client_fd >= 0) {
                        set_nonblocking(client_fd);
                        ev.events = EPOLLIN | EPOLLET;
                        ev.data.fd = client_fd;
                        epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &ev);
                    }
                } else {
                    handle_client(events[n].data.fd, epoll_fd);
                }
            }
        }
    }

    void handle_client(int client_fd, int epoll_fd) {
        // Keep socket non-blocking, use MSG_DONTWAIT for all operations
        char buffer[4096];
        int bytes = recv(client_fd, buffer, sizeof(buffer) - 1, MSG_DONTWAIT);
        if (bytes <= 0) { 
            epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr); 
            close(client_fd); 
            return; 
        }
        
        std::string req(buffer, bytes);
        printf("[Server] Received %d bytes\n", bytes);

        // Determine if it's a HTTP Request (likely from Browser)
        bool is_http = (req.find("GET ") != std::string::npos || req.find("POST ") != std::string::npos || req.find("OPTIONS ") != std::string::npos);
        
        // Handle OPTIONS for CORS
        if (is_http && req.find("OPTIONS ") != std::string::npos) {
            std::string res = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: POST, GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n";
            send(client_fd, res.data(), res.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
            epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
            close(client_fd);
            return;
        }

        // Find command ID (the character after the first / in the path)
        // For "GET /J HTTP/1.1", we need to find the / after "GET "
        char cmd_id = 0;
        size_t method_end = req.find(" /");
        if (method_end != std::string::npos) {
            size_t path_start = method_end + 2; // Position after " /"
            if (path_start < req.size() && req[path_start] != ' ') {
                cmd_id = req[path_start];
            }
            // If path_start points to space, cmd_id stays 0 (root path)
        } else if (!is_http) {
            cmd_id = buffer[0]; // Fallback to first byte for raw TCP
        }

        // Extract body if provided (for HTTP POST)
        std::string body_input;
        if (is_http) {
            size_t body_sep = req.find("\r\n\r\n");
            if (body_sep != std::string::npos) {
                body_input = req.substr(body_sep + 4);
                
                // If we have a Content-Length, read remaining body (non-blocking with retry)
                size_t cl_pos = req.find("Content-Length: ");
                if (cl_pos != std::string::npos) {
                    size_t cl_end = req.find("\r\n", cl_pos);
                    int expected_len = std::stoi(req.substr(cl_pos + 16, cl_end - (cl_pos + 16)));
                    int retries = 0;
                    while ((int)body_input.size() < expected_len && retries < 10) {
                        int n = recv(client_fd, buffer, sizeof(buffer), MSG_DONTWAIT);
                        if (n > 0) {
                            body_input.append(buffer, n);
                            retries = 0;  // Reset on successful read
                        } else if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
                            retries++;
                            std::this_thread::sleep_for(std::chrono::microseconds(100));
                        } else {
                            break;  // Error or connection closed
                        }
                    }
                }
            }
        } else {
            // For raw TCP, assume first byte is cmd_id, the rest is body
            if (bytes > 1) body_input = req.substr(1);
        }

        // Check for WebSocket upgrade
        bool is_ws = (req.find("Upgrade: websocket") != std::string::npos) || 
                      (req.find("upgrade: websocket") != std::string::npos) ||
                      (req.find("Upgrade: WebSocket") != std::string::npos);

        if (is_ws) {
            std::string key;
            size_t key_pos = req.find("Sec-WebSocket-Key: ");
            if (key_pos == std::string::npos) key_pos = req.find("sec-websocket-key: ");
            
            if (key_pos != std::string::npos) {
                size_t start = key_pos + 19;
                size_t end = req.find("\r", start);
                if (end == std::string::npos) end = req.find("\n", start);
                key = req.substr(start, end - start);
                key.erase(0, key.find_first_not_of(" "));
                key.erase(key.find_last_not_of(" ") + 1);

                std::string accept = sha1_ws(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
                printf("[Server] WS Handshake for key: [%s] -> accept: [%s]\n", key.c_str(), accept.c_str());
                
                std::string handshake = 
                    "HTTP/1.1 101 Switching Protocols\r\n"
                    "Upgrade: websocket\r\n"
                    "Connection: Upgrade\r\n"
                    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";
                
                send(client_fd, handshake.data(), handshake.size(), MSG_NOSIGNAL | MSG_DONTWAIT);

                if (streams.count(cmd_id)) {
                    // Set socket to non-blocking for broadcast
                    set_nonblocking(client_fd);
                    
                    // Enable TCP_NODELAY for low latency
                    int opt = 1;
                    setsockopt(client_fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt));
                    
                    // Add to broadcast list instead of spawning thread
                    {
                        std::lock_guard<std::mutex> lock(stream_clients_mutex);
                        stream_clients[cmd_id].insert(client_fd);
                        printf("[Server] Added stream client fd=%d for cmd=%c (total: %zu)\n", 
                               client_fd, cmd_id, stream_clients[cmd_id].size());
                    }
                    
                    // Remove from epoll - broadcast thread handles this now
                    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                    return;
                }
            }
        }

        std::string body;
        bool found = false;

        if (cmd_id == 0 && is_http) {
            // Root path - return server health check
            body = "{\"status\":\"ok\"}";
            found = true;
        } else if (cmd_id == '?') {
            body.assign(reinterpret_cast<const char*>(contract_list.data()), contract_list.size() * sizeof(EndpointContract));
            found = true;
        } else if (commands.count(cmd_id)) {
            body = commands[cmd_id](body_input);
            found = true;
        }

        if (is_http) {
            std::string res = found ? "HTTP/1.1 200 OK\r\n" : "HTTP/1.1 404 Not Found\r\n";
            std::string content_type = (cmd_id == 0) ? "application/json" : "application/octet-stream";
            res += "Content-Type: " + content_type + "\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: " + std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body;
            send(client_fd, res.data(), res.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
        } else if (found) {
            send(client_fd, body.data(), body.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
        }

        epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
        close(client_fd);
    }
};

#endif
