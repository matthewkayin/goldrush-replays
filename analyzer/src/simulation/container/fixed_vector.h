#pragma once

#include <cstdint>
#include <cstring>

template <typename T, uint32_t _capacity>
struct FixedVector {
    T data[_capacity];
    uint32_t _size;

    FixedVector() {
        memset(data, 0, sizeof(data));
        clear();
    }

    T& operator[](uint32_t index) {
        return data[index];
    }
    const T& operator[](uint32_t index) const {
        return data[index];
    }

    const T& back() const {
        return data[_size - 1];
    }

    const T& get_from_top(uint32_t index) const {
        return data[_size - 1 - index];
    }

    uint32_t size() const {
        return _size;
    }

    uint32_t capacity() const {
        return _capacity;
    }

    void push_back(T value) {
        data[_size] = value;
        _size++;
    }

    void pop_back() {
        _size--;
    }

    // Removes an element with pop and swap idiom
    // This is fast, but does not preserve array order
    void remove_at_unordered(uint32_t index) {
        data[index] = data[_size - 1];
        _size--;
    }

    // Removes an element while keeping array order intact
    // This is slower than remove_at_unordered()
    void remove_at_ordered(uint32_t index) {
        for (uint32_t replace_index = index; replace_index < _size - 1; replace_index++) {
            data[replace_index] = data[replace_index + 1];
        }
        _size--;
    }

    void clear() {
        _size = 0;
    }

    bool empty() const {
        return _size == 0;
    }

    bool is_full() const {
        return _size == _capacity;
    }

    bool contains(T value) const {
        for (uint32_t index = 0; index < _size; index++) {
            if (data[index] == value) {
                return true;
            }
        }

        return false;
    }
};
