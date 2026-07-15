cmake_minimum_required(VERSION 2.8)

# set(CMAKE_C_COMPILER /usr/bin/gcc-8)
# set(CMAKE_CXX_COMPILER /usr/bin/g++-8)

project("tracking")

# release
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_CXX_FLAGS "-Wall -Wextra -std=c++17")
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

# # debug
# set(CMAKE_CXX_FLAGS "-Wall -Wextra -std=c++17 -pg")

# set(VISP_DIR /home/jinwli/Code/Repo/visp-3.2.0/build)
set(VISP_DIR /functions/visp-3.2.0/build)
#list(APPEND CMAKE_MODULE_PATH ${PROJECT_SOURCE_DIR}/3rdparty/opencv-4.1.0)
find_package(OpenCV REQUIRED)
find_package(VISP REQUIRED)
include_directories(${OpenCV_INCLUDE_DIRS} ${VISP_INCLUDE_DIRS} ${PROJECT_SOURCE_DIR}/3rdparty)

add_executable(track
  track.cpp svf.cpp cmt.cpp consensus.cpp fusion.cpp matcher.cpp
  cmt-tracker.cpp fastcluster.cpp funcDef.cpp ssdscale.cpp trackingSSD.cpp
  vgg_interp2.cpp frame_extractor.cpp)
target_link_libraries(track ${OpenCV_LIBS} ${VISP_LIBRARIES} stdc++fs)

add_executable(track-test
  track-test.cpp svf.cpp cmt.cpp consensus.cpp fusion.cpp matcher.cpp
  cmt-tracker.cpp fastcluster.cpp frame_extractor.cpp)
target_link_libraries(track-test ${OpenCV_LIBS} ${VISP_LIBRARIES} stdc++fs)
