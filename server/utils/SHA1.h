#ifndef SHA1_UTILS_H
#define SHA1_UTILS_H

#include <string>
#include <cstdint>

inline std::string sha1_ws(const std::string& input) {
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

#endif