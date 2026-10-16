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
# SYSTEM so the simulation headers don't raise warnings in the code that includes them.
target_include_directories(simulation SYSTEM PUBLIC src)
target_compile_options(simulation PRIVATE -w)

add_executable(analyzer src/main.cpp src/replay.cpp)
target_compile_options(analyzer PRIVATE -Wall -Wextra -Wshadow)
target_include_directories(analyzer SYSTEM PRIVATE vendor)
target_link_libraries(analyzer PRIVATE simulation)

enable_testing()

# Running without a command must print usage and fail.
add_test(NAME no_command_fails COMMAND analyzer)
set_tests_properties(no_command_fails PROPERTIES WILL_FAIL TRUE)

# Runs tests/run_and_compare.cmake on one replay; see that file for the options.
function(add_replay_test name command replay)
    add_test(NAME ${name}
        COMMAND ${CMAKE_COMMAND}
            -DANALYZER=$<TARGET_FILE:analyzer>
            -DCOMMAND=${command}
            -DREPLAY=${replay}
            ${ARGN}
            -P ${CMAKE_CURRENT_SOURCE_DIR}/tests/run_and_compare.cmake)
endfunction()

# Every replay in test_replays/ must match its saved expected output.
# Regenerate the expected files with tests/update_expected.sh.
file(GLOB TEST_REPLAYS CONFIGURE_DEPENDS test_replays/*.rep)
foreach(replay ${TEST_REPLAYS})
    get_filename_component(name ${replay} NAME_WE)
    get_filename_component(dir ${replay} DIRECTORY)
    add_replay_test(header_${name} header ${replay}
        -DEXPECTED=${dir}/${name}.header.json
        -DACTUAL=${CMAKE_CURRENT_BINARY_DIR}/test_output/${name}.header.json)
endforeach()

# Reading from stdin must give the same output as reading the file.
add_replay_test(header_stdin header ${CMAKE_CURRENT_SOURCE_DIR}/test_replays/test_loss.rep
    -DSTDIN=ON
    -DEXPECTED=${CMAKE_CURRENT_SOURCE_DIR}/test_replays/test_loss.header.json
    -DACTUAL=${CMAKE_CURRENT_BINARY_DIR}/test_output/stdin.header.json)

# Every replay in test_replays/invalid/ must be rejected.
# They are made by tests/make_invalid_fixtures.sh.
file(GLOB INVALID_REPLAYS CONFIGURE_DEPENDS test_replays/invalid/*.rep)
foreach(replay ${INVALID_REPLAYS})
    get_filename_component(name ${replay} NAME_WE)
    add_replay_test(header_rejects_${name} header ${replay} -DEXPECT_FAILURE=ON)
endforeach()
