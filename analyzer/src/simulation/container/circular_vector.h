#pragma once

#include "simulation/defines.h"
#include <cstdint>
#include <cstring>

template <typename T, uint32_t capacity>
struct CircularVector {
    T data[capacity];
    uint32_t tail;
    uint32_t _size;

    CircularVector() {
        memset(data, 0, sizeof(data));
        tail = 0;
        _size = 0;
    }

    T& operator[](uint32_t index) {
        return data[wrap_index(index)];
    }
    const T& operator[](uint32_t index) const {
        return data[wrap_index(index)];
    }

    uint32_t size() const {
        return _size;
    }

    bool empty() const {
        return _size == 0;
    }

    void push_back(T value) {
        data[wrap_index(_size)] = value;
        if (_size == capacity) {
            tail = tail == capacity - 1
                ? 0
                : tail + 1;
        } else {
            _size++;
        }
    }

    void remove_at_unordered(uint32_t index) {
        data[wrap_index(index)] = data[wrap_index(_size - 1)];
        _size--;
    }

    void remove_at_ordered(uint32_t index) {
        if (index < _size - 1) {
            for (uint32_t other_index = index + 1; other_index < _size; other_index++) {
                data[wrap_index(other_index - 1)] = data[wrap_index(other_index)];
            }
        }

        _size--;
    }

    void clear() {
        _size = 0;
    }

    uint32_t wrap_index(uint32_t index) const {
        uint32_t wrapped_index = tail + index;
        if (wrapped_index >= capacity) {
            wrapped_index -= capacity;
        }
        return wrapped_index;
    }
};
