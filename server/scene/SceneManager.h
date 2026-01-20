#ifndef SCENE_MANAGER_H
#define SCENE_MANAGER_H

#include <string>
#include <vector>
#include <memory>
#include <fstream>
#include <sstream>
#include <map>
#include <cmath>
#include "SceneNode.h"
#include "GroundNode.h"
#include "RampNode.h"
#include "BoxNode.h"
#include "../physics/PhysicsSystem.h"

// Simple JSON parser for scene config
class SimpleJson {
public:
    static bool getFloat(const std::string& json, const std::string& key, float& value) {
        size_t pos = json.find("\"" + key + "\":");
        if (pos == std::string::npos) return false;
        
        pos = json.find_first_of("-0123456789.", pos + key.length() + 2);
        if (pos == std::string::npos) return false;
        
        size_t end = json.find_first_not_of("-0123456789.", pos);
        try {
            value = std::stof(json.substr(pos, end - pos));
            return true;
        } catch (...) {
            return false;
        }
    }

    static bool getBool(const std::string& json, const std::string& key, bool& value) {
        size_t pos = json.find("\"" + key + "\":");
        if (pos == std::string::npos) return false;
        
        pos = json.find_first_of("tf", pos + key.length() + 2);
        if (pos == std::string::npos) return false;
        
        value = (json[pos] == 't');
        return true;
    }
    
    static bool getArray(const std::string& json, const std::string& key, std::vector<float>& values) {
        size_t pos = json.find("\"" + key + "\":");
        if (pos == std::string::npos) return false;
        
        pos = json.find('[', pos);
        if (pos == std::string::npos) return false;
        
        size_t end = json.find(']', pos);
        if (end == std::string::npos) return false;
        
        std::string arr = json.substr(pos + 1, end - pos - 1);
        std::stringstream ss(arr);
        std::string num;
        
        while (std::getline(ss, num, ',')) {
            // Trim whitespace
            num.erase(0, num.find_first_not_of(" \t\n\r"));
            num.erase(num.find_last_not_of(" \t\n\r") + 1);
            
            if (!num.empty()) {
                try {
                    values.push_back(std::stof(num));
                } catch (...) {
                    continue;
                }
            }
        }
        
        return !values.empty();
    }
    
    static std::string getString(const std::string& json, const std::string& key) {
        size_t pos = json.find("\"" + key + "\":");
        if (pos == std::string::npos) return "";
        
        pos = json.find('\"', pos + key.length() + 3);
        if (pos == std::string::npos) return "";
        
        size_t end = json.find('\"', pos + 1);
        if (end == std::string::npos) return "";
        
        return json.substr(pos + 1, end - pos - 1);
    }
};

class SceneManager {
public:
    bool load_from_file(const std::string& filename) {
        std::ifstream file(filename);
        if (!file.is_open()) {
            printf("[SceneManager] Failed to open: %s\n", filename.c_str());
            return false;
        }
        
        std::stringstream buffer;
        buffer << file.rdbuf();
        raw_json = buffer.str();
        
        return parse_json(raw_json);
    }

    std::string get_raw_json() const { return raw_json; }
    
    bool parse_json(const std::string& json_str) {
        printf("[SceneManager] Parsing scene configuration...\n");
        
        // Extract nodes array
        size_t nodes_pos = json_str.find("\"nodes\":");
        if (nodes_pos == std::string::npos) {
            printf("[SceneManager] No nodes array found\n");
            return false;
        }
        
        size_t array_start = json_str.find('[', nodes_pos);
        if (array_start == std::string::npos) return false;

        // Correctly find the matching closing bracket for the nodes array
        int array_depth = 0;
        size_t array_end = std::string::npos;
        for (size_t i = array_start; i < json_str.length(); i++) {
            if (json_str[i] == '[') array_depth++;
            else if (json_str[i] == ']') {
                array_depth--;
                if (array_depth == 0) {
                    array_end = i;
                    break;
                }
            }
        }

        if (array_end == std::string::npos) {
            printf("[SceneManager] Unbalanced brackets in nodes array\n");
            return false;
        }
        
        std::string nodes_str = json_str.substr(array_start + 1, array_end - array_start - 1);
        
        // Split by node objects
        size_t pos = 0;
        while (true) {
            size_t obj_start = nodes_str.find('{', pos);
            if (obj_start == std::string::npos) break;
            
            int depth = 0;
            size_t obj_end = std::string::npos;
            for (size_t i = obj_start; i < nodes_str.length(); i++) {
                if (nodes_str[i] == '{') depth++;
                else if (nodes_str[i] == '}') {
                    depth--;
                    if (depth == 0) {
                        obj_end = i;
                        break;
                    }
                }
            }
            
            if (obj_end == std::string::npos) break;

            std::string node_str = nodes_str.substr(obj_start, obj_end - obj_start + 1);
            parse_node(node_str);
            pos = obj_end + 1;
        }
        
        printf("[SceneManager] Loaded %zu nodes\n", nodes.size());
        return true;
    }
    
    void create_all(PhysicsSystem& physics) {
        printf("[SceneManager] Creating %zu scene nodes...\n", nodes.size());
        for (auto& node : nodes) {
            if (node) {
                node->create(physics);
                printf("[SceneManager] Created %s (%s)\n", node->name.c_str(), node->type.c_str());
            }
        }
    }
    
private:
    std::string raw_json;
    std::vector<std::shared_ptr<SceneNode>> nodes;
    
    void parse_node(const std::string& node_json) {
        std::string type = SimpleJson::getString(node_json, "type");
        std::string name = SimpleJson::getString(node_json, "name");
        
        if (type.empty()) return;
        
        std::shared_ptr<SceneNode> node;
        
        if (type == "Ground") {
            auto ground = std::make_shared<GroundNode>(name);
            SimpleJson::getFloat(node_json, "half_extent_x", ground->half_extent_x);
            SimpleJson::getFloat(node_json, "half_extent_y", ground->half_extent_y);
            SimpleJson::getFloat(node_json, "half_extent_z", ground->half_extent_z);
            node = ground;
        }
        else if (type == "Ramp") {
            auto ramp = std::make_shared<RampNode>(name);
            SimpleJson::getFloat(node_json, "half_extent_x", ramp->half_extent_x);
            SimpleJson::getFloat(node_json, "half_extent_y", ramp->half_extent_y);
            SimpleJson::getFloat(node_json, "half_extent_z", ramp->half_extent_z);
            SimpleJson::getFloat(node_json, "angle_x_degrees", ramp->angle_x_degrees);
            node = ramp;
        }
        else if (type == "Box") {
            auto box = std::make_shared<BoxNode>(name);
            SimpleJson::getFloat(node_json, "half_extent_x", box->half_extent_x);
            SimpleJson::getFloat(node_json, "half_extent_y", box->half_extent_y);
            SimpleJson::getFloat(node_json, "half_extent_z", box->half_extent_z);
            SimpleJson::getBool(node_json, "is_dynamic", box->is_dynamic);
            node = box;
        }
        
        if (node) {
            // Parse position
            std::vector<float> pos;
            if (SimpleJson::getArray(node_json, "position", pos) && pos.size() >= 3) {
                node->position = {pos[0], pos[1], pos[2]};
            }
            
            // Parse scale if present
            std::vector<float> scale;
            if (SimpleJson::getArray(node_json, "scale", scale) && scale.size() >= 3) {
                node->scale = {scale[0], scale[1], scale[2]};
            }
            
            nodes.push_back(node);
        }
    }
};

#endif