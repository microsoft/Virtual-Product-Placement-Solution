#ifndef CMT_TRACKER_H
#define CMT_TRACKER_H

#include "utils.h"

class Tracker
{
public:
    Tracker() : thr_fb(30){};
    void track(const cv::Mat im_prev, const cv::Mat im_gray, const std::vector<cv::Point2f> &points_prev,
               std::vector<cv::Point2f> &points_tracked, std::vector<unsigned char> &status);

private:
    float thr_fb;
};

#endif /* end of include guard: TRACKER_H */
