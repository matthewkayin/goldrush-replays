#pragma once

#include <cstdint>
#include <cstddef>

struct MemCursor {
    uint8_t* ptr;
    size_t bytes_read;
    size_t bytes_total;

    bool finished() const;
};

// Intended to behave like fread but for memory
// Reads size bytes from src into dst, then increments src by that many bytes
void memread(void* dst, size_t size, MemCursor* src);
