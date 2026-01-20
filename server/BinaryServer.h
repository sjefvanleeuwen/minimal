#ifndef BINARY_SERVER_H
#define BINARY_SERVER_H

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

#include "utils/SHA1.h"
#include "core/EndpointContract.h"
#include "core/HttpProtocol.h"
#include "core/WebSocketProtocol.h"

class BinaryServer {
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
        
        using clock = std::chrono::steady_clock;
        auto next_tick = clock::now();
        int tick_counter = 0;

        while (broadcast_running) {
            next_tick += std::chrono::nanoseconds(1000000000 / 60); // Precise 60Hz
            tick_counter++;

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
                
                // Build WebSocket frame once
                std::string payload = handler();
                if (payload.empty()) continue;

                std::vector<unsigned char> header = WebSocketProtocol::build_frame_header(payload.size());
                std::vector<unsigned char> full_frame;
                full_frame.reserve(header.size() + payload.size());
                full_frame.insert(full_frame.end(), header.begin(), header.end());
                full_frame.insert(full_frame.end(), payload.begin(), payload.end());
                
                if (tick_counter % 60 == 0) {
                    printf("[Server] Stream %c: %zu bytes (total %zu) to %zu clients\n", 
                           cmd_id, payload.size(), full_frame.size(), clients_snapshot.size());
                }

                // Broadcast to all clients (no lock held during sends!)
                std::vector<int> dead_clients;
                for (int fd : clients_snapshot) {
                    // Send combined frame in one syscall
                    ssize_t sent = send(fd, full_frame.data(), full_frame.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
                    if (sent <= 0) {
                        if (sent < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) continue; 
                        dead_clients.push_back(fd);
                    } else if ((size_t)sent < full_frame.size()) {
                        // Partial send - for high-speed binary streams, this client is lagging
                        // In a production app you might buffer, but for 60Hz we drop to maintain low latency
                        dead_clients.push_back(fd);
                    }
                }

                // Clean up dead clients
                if (!dead_clients.empty()) {
                    std::lock_guard<std::mutex> lock(stream_clients_mutex);
                    auto it = stream_clients.find(cmd_id);
                    if (it != stream_clients.end()) {
                        for (int fd : dead_clients) {
                            it->second.erase(fd);
                            close(fd);
                        }
                    }
                }
            }
            
            // Wait until next tick - more precise than sleep_for(16)
            std::this_thread::sleep_until(next_tick);
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

        if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
            perror("bind failed");
            return;
        }
        listen(server_fd, 1024);
        set_nonblocking(server_fd);

        int epoll_fd = epoll_create1(0);
        struct epoll_event ev, events[1024];
        ev.events = EPOLLIN;
        ev.data.fd = server_fd;
        epoll_ctl(epoll_fd, EPOLL_CTL_ADD, server_fd, &ev);

        while (true) {
            int nfds = epoll_wait(epoll_fd, events, 1024, -1);
            for (int n = 0; n < nfds; ++n) {
                if (events[n].data.fd == server_fd) {
                    while (true) {
                        int client_fd = accept(server_fd, nullptr, nullptr);
                        if (client_fd >= 0) {
                            set_nonblocking(client_fd);
                            ev.events = EPOLLIN | EPOLLET;
                            ev.data.fd = client_fd;
                            epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &ev);
                        } else {
                            break; // All pending connections handled
                        }
                    }
                } else if (events[n].events & EPOLLIN) {
                    handle_client(events[n].data.fd, epoll_fd);
                } else if (events[n].events & (EPOLLERR | EPOLLHUP)) {
                    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, events[n].data.fd, nullptr);
                    close(events[n].data.fd);
                }
            }
        }
    }

    void handle_client(int client_fd, int epoll_fd) {
        char buffer[8192]; // Larger buffer for one-shot reads
        
        while (true) {
            ssize_t bytes = recv(client_fd, buffer, sizeof(buffer) - 1, MSG_DONTWAIT);
            if (bytes < 0) {
                if (errno == EAGAIN || errno == EWOULDBLOCK) break; // Done for now
                epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                close(client_fd);
                return;
            }
            if (bytes == 0) {
                epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                close(client_fd);
                return;
            }
            
            buffer[bytes] = '\0';
            std::string req(buffer, bytes);

            bool is_http = HttpProtocol::is_http(req);
            
            if (is_http && HttpProtocol::is_options(req)) {
                HttpProtocol::send_cors_response(client_fd);
                epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                close(client_fd);
                return;
            }

            char cmd_id = 0;
            size_t method_end = req.find(" /");
            if (method_end != std::string::npos) {
                size_t path_start = method_end + 2; 
                if (path_start < req.size() && req[path_start] != ' ') {
                    cmd_id = req[path_start];
                }
            } else if (!is_http) {
                cmd_id = buffer[0]; 
            }

            std::string body_input;
            if (is_http) {
                body_input = HttpProtocol::extract_body(client_fd, req, buffer, sizeof(buffer));
            } else if (bytes > 1) {
                body_input = req.substr(1);
            }

            if (is_http && WebSocketProtocol::is_upgrade(req)) {
                if (WebSocketProtocol::do_handshake(client_fd, req) != "") {
                    if (streams.count(cmd_id)) {
                        set_nonblocking(client_fd);
                        int opt = 1;
                        setsockopt(client_fd, IPPROTO_TCP, TCP_NODELAY, &opt, sizeof(opt));
                        
                        // Increase send buffer for smooth streaming
                        int sndbuf = 128 * 1024;
                        setsockopt(client_fd, SOL_SOCKET, SO_SNDBUF, &sndbuf, sizeof(sndbuf));

                        {
                            std::lock_guard<std::mutex> lock(stream_clients_mutex);
                            stream_clients[cmd_id].insert(client_fd);
                        }
                        epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                        return; // Handed off to broadcast
                    }
                }
            }

            std::string body;
            bool found = false;

            if (cmd_id == 0 && is_http) {
                body = "{\"status\":\"ok\",\"server\":\"BinaryServer\"}";
                found = true;
            } else if (cmd_id == '?') {
                body.assign(reinterpret_cast<const char*>(contract_list.data()), contract_list.size() * sizeof(EndpointContract));
                found = true;
            } else if (commands.count(cmd_id)) {
                body = commands[cmd_id](body_input);
                found = true;
            }

            if (is_http) {
                std::string content_type = (cmd_id == 0) ? "application/json" : "application/octet-stream";
                HttpProtocol::send_response(client_fd, found, body, content_type);
                epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                close(client_fd);
                return;
            } else if (found) {
                send(client_fd, body.data(), body.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
                // Keep connection open for next non-http command if desired, 
                // but current design closes after response for simplicity
                epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                close(client_fd);
                return;
            }
        }
    }
};

#endif