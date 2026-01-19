#include <string>
#include <cstring>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/epoll.h>
#include <thread>
#include <vector>

const char* swagger_json = "{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Minimal Weather API\",\"version\":\"1.0.0\"},\"paths\":{\"/weatherforecast\":{\"get\":{\"summary\":\"Get weather forecast\",\"responses\":{\"200\":{\"description\":\"A list of weather forecasts\",\"content\":{\"application/json\":{\"example\":[{\"date\":\"2026-01-20\",\"temperatureC\":25,\"summary\":\"Sunny\"}]}}}}}}}}";

const char* weather_json = "[{\"date\":\"2026-01-20\",\"temperatureC\":22,\"summary\":\"Chilly\"},{\"date\":\"2026-01-21\",\"temperatureC\":28,\"summary\":\"Hot\"}]";

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
    address.sin_port = htons(8080);

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
                int client_fd = events[n].data.fd;
                char buffer[1024] = {0};
                int bytes = read(client_fd, buffer, 1024);
                
                if (bytes <= 0) {
                    epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                    close(client_fd);
                    continue;
                }

                const char* body = nullptr;
                const char* status = "HTTP/1.1 200 OK";
                const char* type = "application/json";

                if (strstr(buffer, "GET /weatherforecast")) {
                    body = weather_json;
                } else if (strstr(buffer, "GET /swagger.json")) {
                    body = swagger_json;
                } else {
                    status = "HTTP/1.1 404 Not Found";
                    type = "text/plain";
                    body = "Not Found";
                }

                std::string header = std::string(status) + "\r\n" +
                                     "Content-Type: " + type + "\r\n" +
                                     "Content-Length: " + std::to_string(strlen(body)) + "\r\n" +
                                     "Connection: close\r\n\r\n";
                
                send(client_fd, header.c_str(), header.length(), 0);
                send(client_fd, body, strlen(body), 0);
                
                epoll_ctl(epoll_fd, EPOLL_CTL_DEL, client_fd, nullptr);
                close(client_fd);
            }
        }
    }
}

int main() {
    int threads_count = std::thread::hardware_concurrency();
    if (threads_count == 0) threads_count = 1;

    std::vector<std::thread> workers;
    for (int i = 0; i < threads_count; i++) {
        workers.emplace_back(run_worker);
    }

    for (auto& t : workers) {
        t.join();
    }
    return 0;
}
