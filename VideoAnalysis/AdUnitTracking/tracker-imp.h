#ifndef TRACKER_IMP_H
#define TRACKER_IMP_H

#include "svf.h"
#include "cmt.h"

#include <chrono>

#include <visp3/visp_core.h>
#include <visp3/tt/vpTemplateTrackerSSDESM.h>
#include <visp3/tt/vpTemplateTrackerWarpHomographySL3.h>
#include <visp3/tt/vpTemplateTrackerWarpSRT.h>

#define n_trackers 3

enum trackers
{
    t_esm = 0,
    t_sift,
    t_cmt
};

void esm_tracker_imp(const vpImage<unsigned char> &vp_im_gray,
                     const cv::Mat &im2_gray,
                     const cv::Mat &ref_front_view_gray,
                     const std::vector<cv::Point2f> &unit,
                     const int ref_unit_width, const int ref_unit_height,
                     vpTemplateTrackerSSDESM *tracker,
                     vpTemplateTrackerWarpHomographySL3 *warp,
                     cv::Mat &H,
                     std::vector<cv::Point2f> &unit_hat,
                     cv::Mat &front_view_gray,
                     float &similarity,
                     bool &reinit)
{
    // Track the template
    similarity = 0.;
    try
    {

        tracker->track(vp_im_gray);
        // get H

        vpHomography H_visp = warp->getHomography();
        H = (cv::Mat_<float>(3, 3) << H_visp[0][0], H_visp[0][1], H_visp[0][2], H_visp[1][0], H_visp[1][1], H_visp[1][2], H_visp[2][0], H_visp[2][1], H_visp[2][2]);

        cv::perspectiveTransform(unit, unit_hat, H);

        get_front_view(im2_gray, unit_hat, ref_unit_width, ref_unit_height, front_view_gray);

        similarity = std::max((float)0., ncc(ref_front_view_gray, front_view_gray));
    }
    catch (const vpException &e)
    {
        reinit = true;
    }
}

#ifdef HAVE_OPENCV_CUDAFEATURES2D
void sift_tracker_imp(const cv::Mat &im2,
                      const cv::Mat &im2_gray,
                      const cv::Mat &ref_front_view_gray,
                      const std::vector<cv::Point2f> &unit,
                      const int ref_unit_width, const int ref_unit_height,
                      const cv::Ptr<cv::xfeatures2d::SIFT> &detector,
                      cv::Ptr<cv::cuda::DescriptorMatcher> matcher,
                      const std::vector<cv::KeyPoint> &kpts_ref,
                      const cv::Mat &descs_ref,
                      const bool rootsift,
                      const float sift_ratio,
                      const bool remove_repeat,
                      cv::Mat &H,
                      std::vector<cv::Point2f> &unit_hat,
                      cv::Mat &front_view_gray,
                      float &similarity)
{
    similarity = 0.;
    if (kpts_ref.size() > 3)
    {
        std::vector<cv::KeyPoint> kpts2;
        cv::Mat descs2;
        detector->detect(im2, kpts2);
        if (kpts2.size() > 3)
        {
            detector->compute(im2, kpts2, descs2);

            if (rootsift)
            {
                rootSift(descs2);
            }

            // geo-contrains verification
            std::vector<std::vector<cv::DMatch>> matches;
            std::vector<cv::DMatch> good_matches;
            cv::cuda::GpuMat gd1(descs_ref), gd2(descs2);
            matcher->knnMatch(gd1, gd2, matches, 2);
            for (size_t m_id = 0; m_id < matches.size(); ++m_id)
            {

                if (matches[m_id][0].distance < sift_ratio * matches[m_id][1].distance)
                {
                    good_matches.push_back(matches[m_id][0]);
                }
            }

            std::vector<cv::DMatch> refine_matches = getInliers(kpts_ref, kpts2, good_matches, remove_repeat);
            // homography
            std::vector<cv::Point2f> left_pt_interest;
            std::vector<cv::Point2f> right_pt_interest;

            for (size_t m_id = 0; m_id < refine_matches.size(); ++m_id)
            {
                left_pt_interest.push_back(kpts_ref[refine_matches[m_id].queryIdx].pt);
                right_pt_interest.push_back(kpts2[refine_matches[m_id].trainIdx].pt);
            }

            if (left_pt_interest.size() >= 10)
            {
                cv::Mat pt_mask;
                H = findHomography(left_pt_interest, right_pt_interest, pt_mask, cv::RANSAC);
                cv::perspectiveTransform(unit, unit_hat, H);
                get_front_view(im2_gray, unit_hat, ref_unit_width, ref_unit_height, front_view_gray);
                similarity = std::max((float)0., ncc(ref_front_view_gray, front_view_gray));
            }
        }
    }
}
#else
void sift_tracker_imp(const cv::Mat &im2,
                      const cv::Mat &im2_gray,
                      const cv::Mat &ref_front_view_gray,
                      const std::vector<cv::Point2f> &unit,
                      const int ref_unit_width, const int ref_unit_height,
                      const cv::Ptr<cv::xfeatures2d::SIFT> &detector,
                      const cv::FlannBasedMatcher &matcher,
                      const std::vector<cv::KeyPoint> &kpts_ref,
                      const cv::Mat &descs_ref,
                      const bool rootsift,
                      const float sift_ratio,
                      const bool remove_repeat,
                      cv::Mat &H,
                      std::vector<cv::Point2f> &unit_hat,
                      cv::Mat &front_view_gray,
                      float &similarity)
{
    similarity = 0.;
    if (kpts_ref.size() > 3)
    {
        std::vector<cv::KeyPoint> kpts2;
        cv::Mat descs2;
        detector->detect(im2, kpts2);
        if (kpts2.size() > 3)
        {
            detector->compute(im2, kpts2, descs2);

            if (rootsift)
            {
                rootSift(descs2);
            }

            // geo-contrains verification
            std::vector<std::vector<cv::DMatch>> matches;
            std::vector<cv::DMatch> good_matches;
            matcher.knnMatch(descs_ref, descs2, matches, 2);
            for (size_t m_id = 0; m_id < matches.size(); ++m_id)
            {

                if (matches[m_id][0].distance < sift_ratio * matches[m_id][1].distance)
                {
                    good_matches.push_back(matches[m_id][0]);
                }
            }

            std::vector<cv::DMatch> refine_matches = getInliers(kpts_ref, kpts2, good_matches, remove_repeat);

            // homography
            std::vector<cv::Point2f> left_pt_interest;
            std::vector<cv::Point2f> right_pt_interest;

            for (size_t m_id = 0; m_id < refine_matches.size(); ++m_id)
            {
                left_pt_interest.push_back(kpts_ref[refine_matches[m_id].queryIdx].pt);
                right_pt_interest.push_back(kpts2[refine_matches[m_id].trainIdx].pt);
            }

            if (left_pt_interest.size() >= 10)
            {
                cv::Mat pt_mask;
                H = findHomography(left_pt_interest, right_pt_interest, pt_mask, cv::RANSAC);
                cv::perspectiveTransform(unit, unit_hat, H);
                get_front_view(im2_gray, unit_hat, ref_unit_width, ref_unit_height, front_view_gray);
                similarity = std::max((float)0., ncc(ref_front_view_gray, front_view_gray));
            }
        }
    }
}
#endif

void cmt_tracker_imp(const cv::Mat &im2_gray,
                     const cv::Mat &ref_front_view_gray,
                     const std::vector<cv::Point2f> &unit,
                     const int ref_unit_width, const int ref_unit_height,
                     CMT &cmt_tracker,
                     cv::Mat &H,
                     std::vector<cv::Point2f> &unit_hat,
                     cv::Mat &front_view_gray,
                     float &similarity)
{
    similarity = 0.;
    if (cmt_tracker.is_init)
    {
        cmt_tracker.processFrame(im2_gray);
        unit_hat = cmt_tracker.tracked_unit;
        H = cv::getPerspectiveTransform(unit, unit_hat);
        get_front_view(im2_gray, unit_hat, ref_unit_width, ref_unit_height, front_view_gray);
        similarity = std::max((float)0., ncc(ref_front_view_gray, front_view_gray));
    }
}

#endif
