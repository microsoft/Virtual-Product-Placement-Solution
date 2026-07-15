#include "cmt.h"

#include <opencv2/highgui/highgui.hpp>
#include <opencv2/imgproc/imgproc.hpp>

void CMT::initialize(const cv::Mat &im_gray, const std::vector<cv::Point2f> &unit)
{
    // FILE_LOG(logDEBUG) << "CMT::initialize() call";

    //Remember initial image
    im_prev = im_gray;

    //Compute center of rect
    cv::Point2f center = cv::Point2f(0.0, 0.0);

    //Initialize detector and descriptor
    // detector = cv::FastFeatureDetector::create();
    detector = cv::BRISK::create();
    descriptor = cv::BRISK::create();

    //Get initial keypoints in whole image and compute their descriptors
    std::vector<KeyPoint> keypoints;
    detector->detect(im_gray, keypoints);

    //Divide keypoints into foreground and background keypoints according to selection
    std::vector<KeyPoint> keypoints_fg;
    std::vector<KeyPoint> keypoints_bg;

    for (size_t i = 0; i < keypoints.size(); i++)
    {
        KeyPoint k = keypoints[i];
        cv::Point2f pt = k.pt;

        if (cv::pointPolygonTest(unit, pt, false) >= 0)
        {
            keypoints_fg.push_back(k);

            center += k.pt;
        }

        else
        {
            keypoints_bg.push_back(k);
        }
    }

    if (keypoints_fg.size() < 2)
    {
        std::cerr << "too few keypoints in foreground for cmt." << std::endl;
        is_init = false;
        return;
    }

    center.x /= keypoints_fg.size();
    center.y /= keypoints_fg.size();

    //Create foreground classes
    std::vector<int> classes_fg;
    classes_fg.reserve(keypoints_fg.size());
    for (size_t i = 0; i < keypoints_fg.size(); i++)
    {
        classes_fg.push_back(i);
    }

    //Compute foreground/background features
    cv::Mat descs_fg;
    cv::Mat descs_bg;
    descriptor->compute(im_gray, keypoints_fg, descs_fg);
    descriptor->compute(im_gray, keypoints_bg, descs_bg);

    //Only now is the right time to convert keypoints to points, as compute() might remove some keypoints
    std::vector<cv::Point2f> points_fg;
    std::vector<cv::Point2f> points_bg;

    for (size_t i = 0; i < keypoints_fg.size(); i++)
    {
        points_fg.push_back(keypoints_fg[i].pt);
    }

    // FILE_LOG(logDEBUG) << points_fg.size() << " foreground points.";

    for (size_t i = 0; i < keypoints_bg.size(); i++)
    {
        points_bg.push_back(keypoints_bg[i].pt);
    }

    //Create normalized points
    std::vector<cv::Point2f> points_normalized;
    for (size_t i = 0; i < points_fg.size(); i++)
    {
        points_normalized.push_back(points_fg[i] - center);
    }

    //Initialize matcher
    matcher.initialize(points_normalized, descs_fg, classes_fg, descs_bg, center);

    //Initialize consensus
    consensus.initialize(points_normalized);

    //Create initial set of active keypoints
    for (size_t i = 0; i < keypoints_fg.size(); i++)
    {
        points_active.push_back(keypoints_fg[i].pt);
        classes_active = classes_fg;
    }

    points_initial = points_active;

    // FILE_LOG(logDEBUG) << "CMT::initialize() return";

    tracked_unit = unit;

    center_to_tl = unit[0] - center;
    center_to_tr = unit[1] - center;
    center_to_br = unit[2] - center;
    center_to_bl = unit[3] - center;

    is_init = true;
}

void CMT::processFrame(const cv::Mat &im_gray)
{

    // FILE_LOG(logDEBUG) << "CMT::processFrame() call";

    //Track keypoints
    std::vector<cv::Point2f> points_tracked;
    std::vector<unsigned char> status;
    tracker.track(im_prev, im_gray, points_active, points_tracked, status);

    // FILE_LOG(logDEBUG) << points_tracked.size() << " tracked points.";

    //keep only successful classes
    std::vector<int> classes_tracked;
    for (size_t i = 0; i < classes_active.size(); i++)
    {
        if (status[i])
        {
            classes_tracked.push_back(classes_active[i]);
        }
    }

    //Detect keypoints, compute descriptors
    std::vector<KeyPoint> keypoints;
    detector->detect(im_gray, keypoints);

    // FILE_LOG(logDEBUG) << keypoints.size() << " keypoints found.";

    cv::Mat descriptors;
    descriptor->compute(im_gray, keypoints, descriptors);

    //Match keypoints globally
    std::vector<cv::Point2f> points_matched_global;
    std::vector<int> classes_matched_global;
    matcher.matchGlobal(keypoints, descriptors, points_matched_global, classes_matched_global);

    // FILE_LOG(logDEBUG) << points_matched_global.size() << " points matched globally.";

    //Fuse tracked and globally matched points
    std::vector<cv::Point2f> points_fused;
    std::vector<int> classes_fused;
    fusion.preferFirst(points_tracked, classes_tracked, points_matched_global, classes_matched_global,
                       points_fused, classes_fused);

    // FILE_LOG(logDEBUG) << points_fused.size() << " points fused.";

    //Estimate scale and rotation from the fused points
    float scale;
    float rotation;
    consensus.estimateScaleRotation(points_fused, classes_fused, scale, rotation);

    // FILE_LOG(logDEBUG) << "scale " << scale << ", "
    //                    << "rotation " << rotation;

    //Find inliers and the center of their votes
    cv::Point2f center;
    std::vector<cv::Point2f> points_inlier;
    std::vector<int> classes_inlier;
    consensus.findConsensus(points_fused, classes_fused, scale, rotation,
                            center, points_inlier, classes_inlier);

    // FILE_LOG(logDEBUG) << points_inlier.size() << " inlier points.";
    // FILE_LOG(logDEBUG) << "center " << center;

    //Match keypoints locally
    std::vector<cv::Point2f> points_matched_local;
    std::vector<int> classes_matched_local;
    matcher.matchLocal(keypoints, descriptors, center, scale, rotation, points_matched_local, classes_matched_local);

    // FILE_LOG(logDEBUG) << points_matched_local.size() << " points matched locally.";

    //Clear active points
    points_active.clear();
    classes_active.clear();

    //Fuse locally matched points and inliers
    fusion.preferFirst(points_matched_local, classes_matched_local, points_inlier, classes_inlier, points_active, classes_active);
    //    points_active = points_fused;
    //    classes_active = classes_fused;

    // FILE_LOG(logDEBUG) << points_active.size() << " final fused points.";

    //TODO: Use theta to suppress result
    tracked_unit[0] = center + scale * rotate(center_to_tl, rotation);
    tracked_unit[1] = center + scale * rotate(center_to_tr, rotation);
    tracked_unit[2] = center + scale * rotate(center_to_br, rotation);
    tracked_unit[3] = center + scale * rotate(center_to_bl, rotation);

    //Remember current image
    im_prev = im_gray;

    // tracking confidence
    confidence = std::min(1.0f, (float)points_matched_local.size() / points_initial.size());

    // FILE_LOG(logDEBUG) << "CMT::processFrame() return";
}
