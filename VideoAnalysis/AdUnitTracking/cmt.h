#ifndef CMT_H
#define CMT_H

#include "consensus.h"
#include "fusion.h"
#include "matcher.h"
#include "cmt-tracker.h"

#include <opencv2/features2d/features2d.hpp>

using cv::DescriptorExtractor;
using cv::FeatureDetector;
using cv::Ptr;
using cv::RotatedRect;
using cv::Size2f;

class CMT
{
public:
    CMT() : str_detector("BRISK"), str_descriptor("BRISK"), is_init(false), confidence(0.0){};
    void initialize(const cv::Mat &im_gray, const std::vector<cv::Point2f> &unit);
    void processFrame(const cv::Mat &im_gray);

    Fusion fusion;
    Matcher matcher;
    Tracker tracker;
    Consensus consensus;

    std::string str_detector;
    std::string str_descriptor;

    std::vector<cv::Point2f> points_active; //public for visualization purposes

    // returned 4 corners of tracked unit
    std::vector<cv::Point2f> tracked_unit;

    cv::Point2f center_to_tl;
    cv::Point2f center_to_tr;
    cv::Point2f center_to_br;
    cv::Point2f center_to_bl;

    bool is_init;

    float confidence;

private:
    Ptr<FeatureDetector> detector;
    Ptr<DescriptorExtractor> descriptor;

    std::vector<cv::Point2f> points_initial;

    std::vector<int> classes_active;

    float theta;

    cv::Mat im_prev;
};

#endif /* end of include guard: CMT_H */
