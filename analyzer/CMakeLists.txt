cmake_minimum_required(VERSION 3.20)
project(analyzer LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

add_executable(analyzer src/main.cpp)
target_compile_options(analyzer PRIVATE -Wall -Wextra -Wshadow)

enable_testing()

# Running without a command must print usage and fail.
add_test(NAME no_command_fails COMMAND analyzer)
set_tests_properties(no_command_fails PROPERTIES WILL_FAIL TRUE)
