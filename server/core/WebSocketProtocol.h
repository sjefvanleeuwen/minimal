#ifndef WEBSOCKET_PROTOCOL_H
#define WEBSOCKET_PROTOCOL_H

#include <string>
#include <vector>
#include <sys/socket.h>
#include "../utils/SHA1.h"

class WebSocketProtocol {
public:
    static bool is_upgrade(const std::string& req) {
        return (req.find("Upgrade: websocket") != std::string::npos) || 
               (req.find("upgrade: websocket") != std::string::npos) ||
               (req.find("Upgrade: WebSocket") != std::string::npos);
    }

    static std::string do_handshake(int client_fd, const std::string& req) {
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
            
            std::string handshake = 
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";
            
            send(client_fd, handshake.data(), handshake.size(), MSG_NOSIGNAL | MSG_DONTWAIT);
            return key;
        }
        return "";
    }

    static std::vector<unsigned char> build_frame_header(size_t payload_size) {
        std::vector<unsigned char> frame;
        frame.push_back(0x82); // Binary frame, FIN=1

        if (payload_size <= 125) {
            frame.push_back((unsigned char)payload_size);
        } else if (payload_size <= 65535) {
            frame.push_back(126); // 16-bit length
            frame.push_back((unsigned char)((payload_size >> 8) & 0xFF));
            frame.push_back((unsigned char)(payload_size & 0xFF));
        } else {
            frame.push_back(127); // 64-bit length
            for (int i = 7; i >= 0; i--) {
                frame.push_back((unsigned char)((payload_size >> (8 * i)) & 0xFF));
            }
        }
        return frame;
    }
};

#endif
