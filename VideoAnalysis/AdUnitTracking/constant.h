#ifndef _CONSTANT_H_
#define _CONSTANT_H_

#include <opencv2/opencv.hpp>

// Maximum number of iterations;
const int maxIter = 25;
// Threshold for breaking optimization loop;
const double epsilon = 0.03;
const int maxSize = 32;
const int maxArea = 500000; // default = 5000

const int width = 160;
const int height = 93;
const cv::Size rectSize(width, height);

const int nbFrames = 500;
#endif