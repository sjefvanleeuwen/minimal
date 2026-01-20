#ifndef HTTP_PROTOCOL_H
#define HTTP_PROTOCOL_H

#include <string>
#include <vector>
#include <sys/socket.h>
#include <unistd.h>
#include <thread>

class HttpProtocol {
public:
    static bool is_http(const std::string& req) {
        return (req.find("GET ") == 0 || req.find("POST ") == 0 || req.find("OPTIONS ") == 0);
    }

    static bool is_options(const std::string& req) {
        return req.find("OPTIONS ") == 0;
    }

    static void send_cors_response(int client_fd) {
        std::string res = "HTTP/1.1 204 No Content\r\n"
                          "Access-Control-Allow-Origin: *\r\n"
                          "Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n"
                          "Access-Control-Allow-Headers: Content-Type\r\n"
                          "Connection: close\r\n\r\n";
        send(client_fd, res.data(), res.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
    }

    static std::string extract_body(int client_fd, const std::string& req, char* buffer, size_t buffer_size) {
        size_t body_sep = req.find("\r\n\r\n");
        if (body_sep == std::string::npos) return "";

        std::string body = req.substr(body_sep + 4);
        
        // Check for Content-Length
        size_t cl_pos = req.find("Content-Length: ");
        if (cl_pos == std::string::npos) cl_pos = req.find("content-length: ");

        if (cl_pos != std::string::npos) {
            size_t cl_end = req.find("\r\n", cl_pos);
            try {
                int expected_len = std::stoi(req.substr(cl_pos + 16, cl_end - (cl_pos + 16)));
                int retries = 0;
                while ((int)body.size() < expected_len && retries < 10) {
                    int n = recv(client_fd, buffer, buffer_size, MSG_DONTWAIT);
                    if (n > 0) {
                        body.append(buffer, n);
                        retries = 0;
                    } else if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
                        retries++;
                        std::this_thread::sleep_for(std::chrono::microseconds(100));
                    } else {
                        break;
                    }
                }
            } catch (...) {}
        }
        return body;
    }

    static void send_response(int client_fd, bool found, const std::string& body, const std::string& content_type = "application/octet-stream") {
        std::string res = found ? "HTTP/1.1 200 OK\r\n" : "HTTP/1.1 404 Not Found\r\n";
        res += "Content-Type: " + content_type + "\r\n"
               "Access-Control-Allow-Origin: *\r\n"
               "Content-Length: " + std::to_string(body.size()) + "\r\n"
               "Connection: close\r\n\r\n" + body;
        send(client_fd, res.data(), res.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
    }
};

#endif
