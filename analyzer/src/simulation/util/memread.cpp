#include "memread.h"

#include <cstring>
#include <format>

bool MemCursor::finished() const {
    return bytes_read >= bytes_total;
}

void memread(void* dst, size_t size, MemCursor* src) {
    if (src->bytes_read + size > src->bytes_total) {
        throw std::runtime_error(std::format("memread tried to read {} bytes but only {} bytes remain.",
            size, src->bytes_total - src->bytes_read).c_str());
    }
    memcpy(dst, src->ptr, size);
    src->ptr += size;
    src->bytes_read += size;
}
