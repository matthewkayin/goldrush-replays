# Runs the analyzer on one replay and checks the result. Used by CTest:
#   cmake -DANALYZER=... -DCOMMAND=header -DREPLAY=... [options] -P run_and_compare.cmake
#
# Options:
#   STDIN=ON           pipe the replay on stdin instead of passing its path
#   EXPECTED=<file>    stdout must match this file byte for byte; the actual
#                      output is written to ACTUAL=<file> for diffing
#   EXPECT_FAILURE=ON  the analyzer must exit 1 with a message on stderr and
#                      nothing on stdout

if(STDIN)
  execute_process(
    COMMAND ${ANALYZER} ${COMMAND}
    INPUT_FILE ${REPLAY}
    OUTPUT_VARIABLE stdout
    ERROR_VARIABLE stderr
    RESULT_VARIABLE result)
else()
  execute_process(
    COMMAND ${ANALYZER} ${COMMAND} ${REPLAY}
    OUTPUT_VARIABLE stdout
    ERROR_VARIABLE stderr
    RESULT_VARIABLE result)
endif()

if(EXPECT_FAILURE)
  if(NOT result STREQUAL "1")
    message(FATAL_ERROR "Expected exit code 1, got '${result}'.\nstderr: ${stderr}")
  endif()
  if(stderr STREQUAL "")
    message(FATAL_ERROR "Expected an error message on stderr, got nothing.")
  endif()
  if(NOT stdout STREQUAL "")
    message(FATAL_ERROR "Expected no output on stdout, got:\n${stdout}")
  endif()
  message(STATUS "Rejected as expected: ${stderr}")
  return()
endif()

if(NOT result STREQUAL "0")
  message(FATAL_ERROR "Expected exit code 0, got '${result}'.\nstderr: ${stderr}")
endif()

file(WRITE ${ACTUAL} "${stdout}")
execute_process(
  COMMAND ${CMAKE_COMMAND} -E compare_files ${EXPECTED} ${ACTUAL}
  RESULT_VARIABLE differs)
if(differs)
  message(FATAL_ERROR "Output differs from the expected file. To see how:\n  diff ${EXPECTED} ${ACTUAL}")
endif()
