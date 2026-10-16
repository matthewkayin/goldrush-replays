#include "resource_list.h"

#include <cstddef>
#include <cstring>

static const char* RESOURCE_PATHS[] = {
#define X(name, path) path,
    RESOURCE_LIST
#undef X
};

const char* resource_get_path(ResourceName resource) {
    return RESOURCE_PATHS[resource];
}

bool resource_is_text(ResourceName resource_name) {
    const char* text_resource_path_suffixes[] = {
        ".glsl",
        ".lua",
        ".txt",
        NULL
    };

    // Get a pointer to the extension of the resource path
    size_t last_period_index = 0;
    size_t index = 0;
    while (RESOURCE_PATHS[resource_name][index] != '\0') {
        if (RESOURCE_PATHS[resource_name][index] == '.') {
            last_period_index = index;
        }
        index++;
    }

    const char* resource_path_ptr = RESOURCE_PATHS[resource_name] + last_period_index;
    while (*resource_path_ptr != '.' && *resource_path_ptr != '\0') {
        resource_path_ptr++;
    }

    // Compare the extension string with the suffixes
    const char** suffix_ptr = text_resource_path_suffixes;
    while (*suffix_ptr != NULL) {
        if (strcmp(resource_path_ptr, *suffix_ptr) == 0) {
            return true;
        }
        suffix_ptr++;
    }

    return false;
}
