#ifndef MINIMAL_WEB_H
#define MINIMAL_WEB_H

#include <string>
#include <cstring>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/epoll.h>
#include <thread>
#include <vector>
#include <map>
#include <functional>

struct Response {
    std::string body;
    std::string status = "200 OK";
    std::string content_type = "application/json";
};

class MinimalServer {
public:
    MinimalServer(int port) : port(port) {}

    void on_get(const std::string& path, std::function<Response()> handler) {
        routes[path] = handler;
    }

    void start() {
        int threads_count = std::thread::hardware_concurrency();
        if (threads_count == 0) threads_count = 1;

        std::vector<std::thread> workers;
        for (int i = 0; i < threads_count; i++) {
            workers.emplace_back(&MinimalServer::run_worker, this);
        }

        for (auto& t : workers) {
            t.join();
        }
    }

private:
    int port;
    std::map<std::string, std::function<Response()>> routes;

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

    void handle_client(int client_fd, int epoll_fd) {
        char buffer[1024] = {0};
        int bytes = read(client_fd, buffer, 1024);
        
        if (bytes <= 0) {
            epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
            close(client_fd);
            return;
        }

        Response res = { "Not Found", "404 Not Found", "text/plain" };
        std::string request(buffer);
        
        for (auto const& [path, handler] : routes) {
            if (request.find("GET " + path) != std::string::npos) {
                res = handler();
                break;
            }
        }

        std::string header = "HTTP/1.1 " + res.status + "\r\n" +
                             "Content-Type: " + res.content_type + "\r\n" +
                             "Content-Length: " + std::to_string(res.body.length()) + "\r\n" +
                             "Connection: close\r\n\r\n";
        
        send(client_fd, header.c_str(), header.length(), 0);
        send(client_fd, res.body.c_str(), res.body.length(), 0);
        
        epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
        close(client_fd);
    }
};

#endif
