#ifndef MATCHER_H
#define MATCHER_H

#include "utils.h"

#include <opencv2/opencv_modules.hpp>
#include <opencv2/features2d/features2d.hpp>

#ifdef HAVE_OPENCV_CUDAFEATURES2D
#include <opencv2/cudafeatures2d.hpp>
#endif

using cv::DescriptorMatcher;
using cv::KeyPoint;
using cv::Ptr;

class Matcher
{
public:
        Matcher() : thr_dist(0.25), thr_ratio(0.8), thr_cutoff(20){};
        void initialize(const std::vector<cv::Point2f> &pts_fg_norm, const cv::Mat desc_fg, const std::vector<int> &classes_fg,
                        const cv::Mat desc_bg, const cv::Point2f center);
        void matchGlobal(const std::vector<KeyPoint> &keypoints, const cv::Mat descriptors,
                         std::vector<cv::Point2f> &points_matched, std::vector<int> &classes_matched);
        void matchLocal(const std::vector<KeyPoint> &keypoints, const cv::Mat descriptors,
                        const cv::Point2f center, const float scale, const float rotation,
                        std::vector<cv::Point2f> &points_matched, std::vector<int> &classes_matched);

private:
        std::vector<cv::Point2f> pts_fg_norm;
        cv::Mat database;
        std::vector<int> classes;
        int desc_length;
        int num_bg_points;
#ifdef HAVE_OPENCV_CUDAFEATURES2D
        Ptr<cv::cuda::DescriptorMatcher> bfmatcher;
#else
        Ptr<DescriptorMatcher> bfmatcher;
#endif
        float thr_dist;
        float thr_ratio;
        float thr_cutoff;
};

#endif /* end of include guard: MATCHER_H */
