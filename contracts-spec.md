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
| `0x34` | `'4'` | `RegisterUser` | Create new user with password | `u32:id\|str:name\|str:email` |
| `0x4C` | `'L'` | `Login` | Auth via email/password | `u32:id\|str:name` |
| `0x50` | `'P'` | `ChangePassword` | Update existing password | `c2:status` |
| `0x35` | `'5'` | `GetUser` | Fetch user data by ID | `u32:id\|str:name\|str:email` |
| `0x36` | `'6'` | `UpdateUser` | Update user metadata | `c2:status` |
| `0x37` | `'7'` | `DeleteUser` | Remove user from system | `c2:status` |
| `0x57` | `'W'` | `WorldStream` | Continuous sync of all entity transforms | `(u32,f32,f32,f32,f32,f32,f32,f32)[]` |

## 3. Data Schema (Binary Structs)
Schemas are defined as fixed-width C-style structs to ensure zero-parser overhead for most calls. For dynamic data, we use a length-prefixed format. 

All integers use **Little Endian**.

#### Fixed-Width Types
- `uint32`, `int32`: 4 bytes.
- `char[N]`: N bytes, NULL-terminated string.
- `float`: 4 bytes.

#### Variable-Width Types
- `str`: **Length-prefixed string**. Consists of a `uint32_t` length followed by the UTF-8 bytes. Total size = `4 + length`.

### WeatherData (`0x31`)
Total Size: **24 bytes**

| Offset | Field | Type | Size | Description |
| :--- | :--- | :--- | :--- | :--- |
| 0 | `date` | `uint32` | 4 | Date in YYYYMMDD format |
| 4 | `temp_c` | `int32` | 4 | Temperature in Celsius |
| 8 | `summary` | `char[16]`| 16 | NULL-terminated string summary |

### UserProfile (`0x38`) - Example of Variable Size
Total Size: **Variable**

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `uint32` | User unique ID |
| `name` | `str` | Variable-length username |
| `email` | `str` | Variable-length email |

---

## 4. Client Implementation Guide
To call the API, the client must implement the following logic:

### For Fixed-Size Structs:
```cpp
// ZERO-PARSER MAGIC: Just cast the memory
return *reinterpret_cast<WeatherData*>(buffer);
```

### For Variable-Size Structs:
Clients must read fields sequentially.
```typescript
function parseUserProfile(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    let offset = 0;
    
    const id = view.getUint32(offset, true);
    offset += 4;
    
    const nameLen = view.getUint32(offset, true);
    offset += 4;
    const name = new TextDecoder().decode(buffer.slice(offset, offset + nameLen));
    offset += nameLen;
    
    const emailLen = view.getUint32(offset, true);
    offset += 4;
    const email = new TextDecoder().decode(buffer.slice(offset, offset + emailLen));
    offset += emailLen;
}
```


## 5. Versioning
- **Major Changes:** Change the Port (e.g., 8081 to 8082).
- **Minor Changes:** Add new `CommandID`s.
- **Breaking Schema Changes:** Use a new `CommandID` for the new struct layout (e.g., `'1'` for v1, `'A'` for v2).
