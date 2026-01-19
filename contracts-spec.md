# Minimal Binary Contract Specification (MBCS)

This document defines the generic way to map binary command IDs to structured data and method names. Since we have bypassed HTTP and JSON, this contract replaces Swagger/OpenAPI.

## 1. Protocol Overview
- **Transport:** Raw TCP.
- **Discovery:** Sending `?` returns a list of binary metadata structs.

### Binary Discovery (The '?' Command)
Returns an array of `EndpointContract` structs (36 bytes each):

| Offset | Type | Description |
| :--- | :--- | :--- |
| 0 | `char` | Command ID |
| 1 | `char[31]` | Method Name |
| 32 | `uint32_t` | Response Size |

## 2. Command Registry
Mapping of 1-byte Command IDs to logical service names.

| ID (Hex) | ID (Char) | Method Name | Description | Response Type |
| :--- | :--- | :--- | :--- | :--- |
| `0x3F` | `'?'` | `Discovery` | Binary contract discovery | `EndpointContract[]` |
| `0x31` | `'1'` | `GetWeatherForecast` | Returns current weather struct | `WeatherData` |
| `0x32` | `'2'` | `GetSystemStatus` | Returns system health string | `FixedString` |

## 3. Data Schema (Binary Structs)
Schemas are defined as fixed-width C-style structs to ensure zero-parser overhead. All integers use **Little Endian** (standard for x86/ARM).

### WeatherData (`0x31`)
Total Size: **24 bytes**

| Offset | Field | Type | Size | Description |
| :--- | :--- | :--- | :--- | :--- |
| 0 | `date` | `uint32` | 4 | Date in YYYYMMDD format |
| 4 | `temp_c` | `int32` | 4 | Temperature in Celsius |
| 8 | `summary` | `char[16]`| 16 | NULL-terminated string summary |

---

## 4. Client Implementation Guide
To call the API, the client must implement the following logic (pseudocode):

```cpp
// 1. Define the local contract to match server memory layout
struct WeatherData {
    uint32_t date;
    int32_t temp_c;
    char summary[16];
};

// 2. Wrap the binary call in a named method
WeatherData GetWeatherForecast(Socket s) {
    char cmd = '1';
    s.send(&cmd, 1);
    
    char buffer[24];
    s.recv(buffer, 24);
    
    // ZERO-PARSER MAGIC: Just cast the memory
    return *reinterpret_cast<WeatherData*>(buffer);
}
```

## 5. Versioning
- **Major Changes:** Change the Port (e.g., 8081 to 8082).
- **Minor Changes:** Add new `CommandID`s.
- **Breaking Schema Changes:** Use a new `CommandID` for the new struct layout (e.g., `'1'` for v1, `'A'` for v2).
