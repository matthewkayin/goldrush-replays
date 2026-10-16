cmake_minimum_required(VERSION 3.20)
project(analyzer LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# The game's deterministic simulation, copied from old-project. Its sources are
# kept as close to the game's as possible, so its warnings are switched off
# rather than fixed. It must never be built with -ffast-math: replays only hold
# inputs, so any change in floating-point behavior would desync the simulation.
file(GLOB_RECURSE SIMULATION_SOURCES CONFIGURE_DEPENDS src/simulation/*.cpp)
add_library(simulation STATIC ${SIMULATION_SOURCES})
target_include_directories(simulation PUBLIC src)
target_compile_options(simulation PRIVATE -w)

add_executable(analyzer src/main.cpp)
target_compile_options(analyzer PRIVATE -Wall -Wextra -Wshadow)
target_link_libraries(analyzer PRIVATE simulation)

enable_testing()

# Running without a command must print usage and fail.
add_test(NAME no_command_fails COMMAND analyzer)
set_tests_properties(no_command_fails PROPERTIES WILL_FAIL TRUE)
