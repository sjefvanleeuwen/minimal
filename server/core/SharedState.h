#ifndef CORE_SHARED_STATE_H
#define CORE_SHARED_STATE_H

#include <string>
#include <mutex>
#include <atomic>

class SharedWorldState {
public:
    void update(const std::string& new_payload) {
        std::lock_guard<std::mutex> lock(mtx);
        payload = new_payload;
        has_data = true;
    }

    std::string get() {
        std::lock_guard<std::mutex> lock(mtx);
        return payload;
    }

    bool empty() const {
        return !has_data;
    }

private:
    std::string payload;
    std::mutex mtx;
    std::atomic<bool> has_data{false};
};

#endif
