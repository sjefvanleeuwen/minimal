#ifndef BINARY_WEB_H
#define BINARY_WEB_H

#include <string>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/epoll.h>
#include <thread>
#include <vector>
#include <functional>
#include <map>
#include <cstring>

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
    }

    void join() {
        for (auto& t : workers) {
            if (t.joinable()) t.join();
        }
    }

private:
    int port;
    std::map<char, std::function<std::string(const std::string&)>> commands;
    std::map<char, std::function<std::string()>> streams;
    std::vector<std::thread> workers;
    std::vector<EndpointContract> contract_list;

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

    void set_nonblocking(int fd) {
        int flags = fcntl(fd, F_GETFL, 0);
        fcntl(fd, F_SETFL, flags | O_NONBLOCK);
    }

    void run_worker() {
        int server_fd = socket(AF_INET, SOCK_STREAM, 0);
        int opt = 1;
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));

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

    void set_blocking(int fd) {
        int flags = fcntl(fd, F_GETFL, 0);
        fcntl(fd, F_SETFL, flags & ~O_NONBLOCK);
    }

    void handle_client(int client_fd, int epoll_fd) {
        // Switch to blocking for simpler request/response handling in the worker
        set_blocking(client_fd);

        char buffer[4096];
        int bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
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
            send(client_fd, res.data(), res.size(), 0);
            close(client_fd);
            return;
        }

        // Find command ID (the character after the first /)
        char cmd_id = 0;
        size_t path_start = req.find("/");
        if (path_start != std::string::npos && path_start + 1 < req.size()) {
            cmd_id = req[path_start + 1];
        } else {
            cmd_id = buffer[0]; // Fallback to first byte for raw TCP
        }

        // Extract body if provided (for HTTP POST)
        std::string body_input;
        if (is_http) {
            size_t body_sep = req.find("\r\n\r\n");
            if (body_sep != std::string::npos) {
                body_input = req.substr(body_sep + 4);
                
                // If we have a Content-Length, ensure we read everything
                size_t cl_pos = req.find("Content-Length: ");
                if (cl_pos != std::string::npos) {
                    size_t cl_end = req.find("\r\n", cl_pos);
                    int expected_len = std::stoi(req.substr(cl_pos + 16, cl_end - (cl_pos + 16)));
                    while ((int)body_input.size() < expected_len) {
                        int n = recv(client_fd, buffer, sizeof(buffer), 0);
                        if (n <= 0) break;
                        body_input.append(buffer, n);
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
                
                send(client_fd, handshake.data(), handshake.size(), 0);

                if (streams.count(cmd_id)) {
                    std::thread([this, client_fd, cmd_id]() {
                        auto handler = streams[cmd_id];
                        while (true) {
                            std::string p = handler();
                            if (p.empty()) break;

                            unsigned char frame[4];
                            int frame_idx = 0;
                            frame[frame_idx++] = 0x82; // Binary frame

                            if (p.size() <= 125) {
                                frame[frame_idx++] = (unsigned char)p.size();
                            } else {
                                frame[frame_idx++] = 126; // 16-bit length
                                frame[frame_idx++] = (unsigned char)((p.size() >> 8) & 0xFF);
                                frame[frame_idx++] = (unsigned char)(p.size() & 0xFF);
                            }

                            if (send(client_fd, frame, frame_idx, MSG_NOSIGNAL) <= 0) break;
                            if (send(client_fd, p.data(), p.size(), MSG_NOSIGNAL) <= 0) break;
                            
                            std::this_thread::sleep_for(std::chrono::seconds(1));
                        }
                        close(client_fd);
                    }).detach();
                    
                    // Connection is now owned by the stream thread
                    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                    return;
                }
            }
        }

        std::string body;
        bool found = false;

        if (cmd_id == '?') {
            body.assign(reinterpret_cast<const char*>(contract_list.data()), contract_list.size() * sizeof(EndpointContract));
            found = true;
        } else if (commands.count(cmd_id)) {
            body = commands[cmd_id](body_input);
            found = true;
        }

        if (is_http) {
            std::string res = found ? "HTTP/1.1 200 OK\r\n" : "HTTP/1.1 404 Not Found\r\n";
            res += "Content-Type: application/octet-stream\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: " + std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body;
            send(client_fd, res.data(), res.size(), 0);
        } else if (found) {
            send(client_fd, body.data(), body.size(), 0);
        }

        epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
        close(client_fd);
    }
};

#endif
