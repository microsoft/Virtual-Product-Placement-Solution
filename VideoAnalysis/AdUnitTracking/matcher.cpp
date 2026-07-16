#include "matcher.h"
#include <chrono>

using cv::DMatch;
using cv::vconcat;

void Matcher::initialize(const std::vector<cv::Point2f> &pts_fg_norm, const cv::Mat desc_fg, const std::vector<int> &classes_fg,
                         const cv::Mat desc_bg, const cv::Point2f center)
{
    // FILE_LOG(logDEBUG) << "Matcher::initialize() call";

    //Copy normalized points
    this->pts_fg_norm = pts_fg_norm;

    //Remember number of background points
    this->num_bg_points = desc_bg.rows;

    //Form database by stacking background and foreground features
    if (desc_bg.rows > 0 && desc_fg.rows > 0)
        vconcat(desc_bg, desc_fg, database);
    else if (desc_bg.rows > 0)
        database = desc_bg;
    else
        database = desc_fg;

    //Extract descriptor length from features
    desc_length = database.cols * 8;

    //Create background classes (-1)
    std::vector<int> classes_bg = std::vector<int>(desc_bg.rows, -1);

    //Concatenate fg and bg classes
    classes = classes_bg;
    classes.insert(classes.end(), classes_fg.begin(), classes_fg.end());

//Create descriptor matcher
#ifdef HAVE_OPENCV_CUDAFEATURES2D
    bfmatcher = cv::cuda::DescriptorMatcher::createBFMatcher(cv::NORM_HAMMING);
#else
    bfmatcher = DescriptorMatcher::create("BruteForce-Hamming");
#endif

    // FILE_LOG(logDEBUG) << "Matcher::initialize() return";
}

void Matcher::matchGlobal(const std::vector<KeyPoint> &keypoints, const cv::Mat descriptors,
                          std::vector<cv::Point2f> &points_matched, std::vector<int> &classes_matched)
{
    // FILE_LOG(logDEBUG) << "Matcher::matchGlobal() call";

    if (keypoints.size() == 0)
    {
        // FILE_LOG(logDEBUG) << "Matcher::matchGlobal() return";
        return;
    }

    std::vector<std::vector<DMatch>> matches;
#ifdef HAVE_OPENCV_CUDAFEATURES2D
    cv::cuda::GpuMat gd1(descriptors), gd2(database);
    bfmatcher->knnMatch(gd1, gd2, matches, 2);
#else
    bfmatcher->knnMatch(descriptors, database, matches, 2);
#endif

    for (size_t i = 0; i < matches.size(); i++)
    {
        std::vector<DMatch> m = matches[i];

        float distance1 = m[0].distance / desc_length;
        float distance2 = m[1].distance / desc_length;
        int matched_class = classes[m[0].trainIdx];

        if (matched_class == -1)
            continue;
        if (distance1 > thr_dist)
            continue;
        if (distance1 / distance2 > thr_ratio)
            continue;

        points_matched.push_back(keypoints[i].pt);
        classes_matched.push_back(matched_class);
    }

    // FILE_LOG(logDEBUG) << "Matcher::matchGlobal() return";
}

void Matcher::matchLocal(const std::vector<KeyPoint> &keypoints, const cv::Mat descriptors,
                         const cv::Point2f center, const float scale, const float rotation,
                         std::vector<cv::Point2f> &points_matched, std::vector<int> &classes_matched)
{
    // FILE_LOG(logDEBUG) << "Matcher::matchLocal() call";

    if (keypoints.size() == 0)
    {
        // FILE_LOG(logDEBUG) << "Matcher::matchLocal() return";
        return;
    }

    //Transform initial points
    std::vector<cv::Point2f> pts_fg_trans;
    pts_fg_trans.reserve(pts_fg_norm.size());
    for (size_t i = 0; i < pts_fg_norm.size(); i++)
    {
        pts_fg_trans.push_back(scale * rotate(pts_fg_norm[i], -rotation));
    }

    //Perform local matching
    for (size_t i = 0; i < keypoints.size(); i++)
    {
        //Normalize keypoint with respect to center
        cv::Point2f location_rel = keypoints[i].pt - center;

        //Find potential indices for matching
        std::vector<int> indices_potential;
        for (size_t j = 0; j < pts_fg_trans.size(); j++)
        {
            float l2norm = norm(pts_fg_trans[j] - location_rel);

            if (l2norm < thr_cutoff)
            {
                indices_potential.push_back(num_bg_points + j);
            }
        }

        //If there are no potential matches, continue
        if (indices_potential.size() == 0)
            continue;

        //Build descriptor matrix and classes from potential indices
        cv::Mat database_potential = cv::Mat(indices_potential.size(), database.cols, database.type());
        for (size_t j = 0; j < indices_potential.size(); j++)
        {
            database.row(indices_potential[j]).copyTo(database_potential.row(j));
        }

        //Find distances between descriptors
        std::vector<std::vector<DMatch>> matches;
#ifdef HAVE_OPENCV_CUDAFEATURES2D
        cv::cuda::GpuMat gd1(descriptors.row(i)), gd2(database_potential);
        bfmatcher->knnMatch(gd1, gd2, matches, 2);
#else
        bfmatcher->knnMatch(descriptors.row(i), database_potential, matches, 2);
#endif

        std::vector<DMatch> m = matches[0];

        float distance1 = m[0].distance / desc_length;
        float distance2 = m.size() > 1 ? m[1].distance / desc_length : 1;

        if (distance1 > thr_dist)
            continue;
        if (distance1 / distance2 > thr_ratio)
            continue;

        int matched_class = classes[indices_potential[m[0].trainIdx]];

        points_matched.push_back(keypoints[i].pt);
        classes_matched.push_back(matched_class);
    }

    // FILE_LOG(logDEBUG) << "Matcher::matchLocal() return";
}
