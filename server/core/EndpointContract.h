#ifndef ENDPOINT_CONTRACT_H
#define ENDPOINT_CONTRACT_H

#include <cstdint>

struct EndpointContract {
    char id;
    char name[31];
    uint32_t response_size;
    uint32_t type; // 0: Request-Response, 1: Streaming (WebSocket)
    char request_schema[44];
    char response_schema[44];
} __attribute__((packed));

#endif