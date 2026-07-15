#include "svf.h"
#include "cmt.h"
#include "utils.h"
#include "tracker-imp.h"

#include <chrono>
#include <thread>

#include <opencv2/core/utility.hpp>

#include <visp3/visp_core.h>
#include <visp3/tt/vpTemplateTrackerSSDESM.h>
#include <visp3/tt/vpTemplateTrackerWarpHomographySL3.h>
#include <visp3/tt/vpTemplateTrackerWarpSRT.h>

int main(int argc, char **argv)
{
    cv::CommandLineParser parser(argc, argv,
                                 "{@cfg_file || input config file}"
                                 "{@data_folder || input data folder (which contains jpgs)}"
                                 "{@start_frame || start frame number to track (included)}"
                                 "{@end_frame || end frame number to track (included)}"
                                 "{@tl_x || top left point of an ad unit}"
                                 "{@tl_y || top left point of an ad unit}"
                                 "{@tr_x || top right point of an ad unit}"
                                 "{@tr_y || top right point of an ad unit}"
                                 "{@br_x || bottom right point of an ad unit}"
                                 "{@br_y || bottom right point of an ad unit}"
                                 "{@bl_x || bottom left point of an ad unit}"
                                 "{@bl_y || bottom left point of an ad unit}"
                                 "{@output_folder | output | output tracked unit json folder}"
                                 "{h help || print help info}");

    if (parser.has("help"))
    {
        std::cout << "Usage : " << argv[0] << " [options]" << std::endl;
        std::cout << "Available options:" << std::endl;
        parser.printMessage();
        return 0;
    }
    std::string cfg_file = parser.get<std::string>("@cfg_file");
    std::string data_folder = parser.get<std::string>("@data_folder");
    if (data_folder[data_folder.size() - 1] != '/')
    {
        data_folder += "/";
    }

    int start_fid = parser.get<int>("@start_frame");
    int end_fid = parser.get<int>("@end_frame") + 1;
    float tl_x = parser.get<float>("@tl_x");
    float tl_y = parser.get<float>("@tl_y");
    float tr_x = parser.get<float>("@tr_x");
    float tr_y = parser.get<float>("@tr_y");
    float br_x = parser.get<float>("@br_x");
    float br_y = parser.get<float>("@br_y");
    float bl_x = parser.get<float>("@bl_x");
    float bl_y = parser.get<float>("@bl_y");

    std::string output_folder = parser.get<std::string>("@output_folder");
    if (output_folder[output_folder.size() - 1] != '/')
    {
        output_folder += "/";
    }

    if (!fs::exists(data_folder + "../" + output_folder))
    {
        fs::create_directory(data_folder + "../" + output_folder);
    }

    json cfg_json;
    load_json_file(cfg_file, cfg_json);

    // tracking
    std::vector<cv::Point2f> unit;
    unit.push_back(cv::Point2f(tl_x, tl_y));
    unit.push_back(cv::Point2f(tr_x, tr_y));
    unit.push_back(cv::Point2f(br_x, br_y));
    unit.push_back(cv::Point2f(bl_x, bl_y));

    cv::Mat im1 = cv::imread(data_folder + std::to_string(start_fid) + ".jpg");
    if (im1.empty())
    {
        std::cerr << "cannot open image." << std::endl;
        return 0;
    }

    int im_width = im1.cols;
    int im_height = im1.rows;

    float scale = 1.;
    float long_len = (float)std::max(im_width, im_height);
    float short_len = (float)std::min(im_width, im_height);
    scale = std::min(cfg_json["FRAME_MAX_LONG"].get<float>() / long_len, cfg_json["FRAME_MAX_SHORT"].get<float>() / short_len);
    if (scale < 1.)
    {
        cv::resize(im1, im1, cv::Size(), scale, scale, cv::INTER_AREA);

        for (size_t uid = 0; uid < unit.size(); ++uid)
        {
            unit[uid] *= scale;
        }
    }

    int ref_unit_width = (int)std::round(std::max(cv::norm(unit[2] - unit[3]), cv::norm(unit[0] - unit[1])));
    int ref_unit_height = (int)std::round(std::max(cv::norm(unit[0] - unit[3]), cv::norm(unit[1] - unit[2])));

    cv::Mat im1_gray;
    cv::cvtColor(im1, im1_gray, cv::COLOR_BGR2GRAY);

    cv::Mat ref_front_view_gray;
    get_front_view(im1_gray, unit, ref_unit_width, ref_unit_height, ref_front_view_gray);

    // visp template tracker esm
    vpImage<unsigned char> vp_im, vp_im_gray;
    vpImageConvert::convert(im1, vp_im);
    vpImageConvert::convert(im1_gray, vp_im_gray);

    vpTemplateTrackerWarpHomographySL3 *esm_warp = new vpTemplateTrackerWarpHomographySL3;
    vpTemplateTrackerSSDESM *esm_tracker = new vpTemplateTrackerSSDESM(esm_warp);

    esm_tracker->setSampling(2, 2);
    esm_tracker->setLambda(0.001);
    esm_tracker->setThresholdGradient(60.);
    esm_tracker->setIterationMax(800);
    if (cfg_json["AD_UNITS_TRACKING"]["PYRAMIDAL_TRACKING"].get<bool>())
    {
        esm_tracker->setPyramidal(2, 1);
    }

    std::vector<vpImagePoint> v_ip;
    vpImagePoint ip;
    ip.set_uv(unit[0].x, unit[0].y);
    v_ip.push_back(ip);
    ip.set_uv(unit[1].x, unit[1].y);
    v_ip.push_back(ip);
    ip.set_uv(unit[2].x, unit[2].y);
    v_ip.push_back(ip); // ends the first triangle
    ip.set_uv(unit[2].x, unit[2].y);
    v_ip.push_back(ip); // start the second triangle
    ip.set_uv(unit[3].x, unit[3].y);
    v_ip.push_back(ip);
    ip.set_uv(unit[0].x, unit[0].y);
    v_ip.push_back(ip);

    esm_tracker->initFromPoints(vp_im_gray, v_ip, false);

    bool reinit = false;

    // sift
    cv::Ptr<cv::xfeatures2d::SIFT> detector = cv::xfeatures2d::SIFT::create();
#ifdef HAVE_OPENCV_CUDAFEATURES2D
    cv::Ptr<cv::cuda::DescriptorMatcher> matcher = cv::cuda::DescriptorMatcher::createBFMatcher(cv::NORM_L2);
#else
    cv::FlannBasedMatcher matcher;
#endif
    std::vector<cv::KeyPoint> kpts_ref;
    cv::Mat descs_ref;
    cv::Mat mask(im1.rows, im1.cols, CV_8UC1, cv::Scalar(0));
    cv::drawContours(mask, std::vector<std::vector<cv::Point>>(1, convert_points(unit)), -1, cv::Scalar(255, 255, 255), -1, cv::LINE_AA);

    detector->detect(im1, kpts_ref, mask);
    if (kpts_ref.size() < 3)
    {
        std::cout << "too few feature points." << std::endl;
        return 0;
    }
    detector->compute(im1, kpts_ref, descs_ref);
    if (cfg_json["AD_UNITS_TRACKING"]["ROOTSIFT"].get<bool>())
    {
        rootSift(descs_ref);
    }

    // cmt
    CMT cmt_tracker;
    cmt_tracker.consensus.estimate_scale = cfg_json["AD_UNITS_TRACKING"]["CMT_ESTIMATE_SCALE"].get<bool>();
    cmt_tracker.consensus.estimate_rotation = cfg_json["AD_UNITS_TRACKING"]["CMT_ESTIMATE_ROTATION"].get<bool>();
    cmt_tracker.initialize(im1_gray, unit);

    // start tracking
    json ad_units_json;
    if (scale < 1.)
    {
        std::cout << "scale: " << scale << std::endl;
        std::vector<cv::Point2f> unit_scaled(unit);
        for (size_t uid = 0; uid < unit_scaled.size(); ++uid)
        {
            unit_scaled[uid] /= scale;
        }
        ad_units_json[std::to_string(start_fid)]["unit"] = json(unit_scaled);
    }
    else
    {
        ad_units_json[std::to_string(start_fid)]["unit"] = json(unit);
    }
    ad_units_json[std::to_string(start_fid)]["ncc_score"] = 1.;
    ad_units_json[std::to_string(start_fid)]["cmt_confidence"] = 1.;

    vpImage<unsigned char> vp_im2, vp_im_gray2;

    std::vector<cv::Mat> H;
    H.assign(n_trackers, cv::Mat());

    std::vector<std::vector<cv::Point2f>> unit_hat;
    unit_hat.assign(n_trackers, std::vector<cv::Point2f>());

    std::vector<cv::Mat> front_view_gray;
    front_view_gray.assign(n_trackers, cv::Mat());

    std::vector<float> similarity;
    similarity.assign(n_trackers, 0.0);

    for (int i = start_fid + 1; i < end_fid; ++i)
    {
        auto t_start = std::chrono::high_resolution_clock::now();

        cv::Mat im2 = cv::imread(data_folder + std::to_string(i) + ".jpg");
        if (im2.empty())
        {
            std::cerr << "cannot open image." << std::endl;
            return 0;
        }
        if (scale < 1.)
        {
            cv::resize(im2, im2, cv::Size(), scale, scale, cv::INTER_AREA);
        }

        cv::Mat im2_gray;
        cv::cvtColor(im2, im2_gray, cv::COLOR_BGR2GRAY);

        vpImageConvert::convert(im2, vp_im2);
        vpImageConvert::convert(im2_gray, vp_im_gray2);

        std::thread t1(esm_tracker_imp, std::ref(vp_im_gray2), std::ref(im2_gray), std::ref(ref_front_view_gray), std::ref(unit), ref_unit_width, ref_unit_height,
                       esm_tracker, esm_warp, std::ref(H[0]), std::ref(unit_hat[0]), std::ref(front_view_gray[0]), std::ref(similarity[0]), std::ref(reinit));

#ifdef HAVE_OPENCV_CUDAFEATURES2D
        std::thread t2(sift_tracker_imp, std::ref(im2), std::ref(im2_gray), std::ref(ref_front_view_gray), std::ref(unit), ref_unit_width, ref_unit_height, std::ref(detector), matcher, std::ref(kpts_ref), std::ref(descs_ref),
                       cfg_json["AD_UNITS_TRACKING"]["ROOTSIFT"].get<bool>(), cfg_json["AD_UNITS_TRACKING"]["SIFTRATIO"].get<float>(), cfg_json["AD_UNITS_TRACKING"]["REMOVEREPEAT"].get<bool>(),
                       std::ref(H[1]), std::ref(unit_hat[1]), std::ref(front_view_gray[1]), std::ref(similarity[1]));
#else
        std::thread t2(sift_tracker_imp, std::ref(im2), std::ref(im2_gray), std::ref(ref_front_view_gray), std::ref(unit), ref_unit_width, ref_unit_height, std::ref(detector), std::ref(matcher), std::ref(kpts_ref), std::ref(descs_ref),
                       cfg_json["AD_UNITS_TRACKING"]["ROOTSIFT"].get<bool>(), cfg_json["AD_UNITS_TRACKING"]["SIFTRATIO"].get<float>(), cfg_json["AD_UNITS_TRACKING"]["REMOVEREPEAT"].get<bool>(),
                       std::ref(H[1]), std::ref(unit_hat[1]), std::ref(front_view_gray[1]), std::ref(similarity[1]));
#endif

        std::thread t3(cmt_tracker_imp, std::ref(im2_gray), std::ref(ref_front_view_gray), std::ref(unit), ref_unit_width, ref_unit_height, std::ref(cmt_tracker),
                       std::ref(H[2]), std::ref(unit_hat[2]), std::ref(front_view_gray[2]), std::ref(similarity[2]));

        t1.join();
        t2.join();
        t3.join();

        auto t_mid = std::chrono::high_resolution_clock::now();

        // get max similarity id
        int max_id = std::distance(similarity.begin(), std::max_element(similarity.begin(), similarity.end()));

        if (reinit)
        {
            // reinit template tracker
            if (cfg_json["DEBUG"].get<bool>())
            {
                std::cout << "ESM tracker failed, reinit." << std::endl;
            }

            esm_tracker->resetTracker();
            esm_tracker->initFromPoints(vp_im_gray, v_ip, false);

            reinit = false;
        }

        if (scale < 1.)
        {
            std::vector<cv::Point2f> unit_hat_scaled(unit_hat[max_id]);
            for (size_t uid = 0; uid < unit_hat_scaled.size(); ++uid)
            {
                unit_hat_scaled[uid] /= scale;
            }
            ad_units_json[std::to_string(i)]["unit"] = json(unit_hat_scaled);
        }
        else
        {
            ad_units_json[std::to_string(i)]["unit"] = json(unit_hat[max_id]);
        }
        ad_units_json[std::to_string(i)]["ncc_score"] = similarity[max_id];
        ad_units_json[std::to_string(i)]["cmt_confidence"] = cmt_tracker.confidence;

        auto t_end = std::chrono::high_resolution_clock::now();

        if (cfg_json["DEBUG"].get<bool>())
        {
            std::cout << "##############" << std::endl;
            std::cout << "template: " << similarity[0] << ", sift:" << similarity[1] << " cmt: " << similarity[2] << std::endl;
            std::cout << "cmt_confidence: " << cmt_tracker.confidence << std::endl;

            cv::imshow("ref front view", ref_front_view_gray);
            cv::imshow("front view", front_view_gray[max_id]);
            std::cout << max_id << std::endl;

            cv::waitKey(1);
            std::cout << i - 1 << " -> " << i << " time: " << std::chrono::duration<float, std::milli>(t_mid - t_start).count() << "ms, " << std::chrono::duration<float, std::milli>(t_end - t_mid).count() << "ms" << std::endl;
            std::cout << "##############" << std::endl;
        }
    }

    std::fstream f(data_folder + "../" + output_folder + "unit.json", std::ios::out);

    f << std::setw(4) << ad_units_json << std::endl;

    f.close();

    if (cfg_json["DEBUG"].get<bool>())
    {
        cv::VideoWriter vwtr = cv::VideoWriter(data_folder + "../" + output_folder + "unit.avi", cv::VideoWriter::fourcc('X', 'V', 'I', 'D'), 25.0, cv::Size(im_width, im_height));
        for (int i = start_fid; i < end_fid; ++i)
        {
            cv::Mat im = cv::imread(data_folder + std::to_string(i) + ".jpg");
            if (im.empty())
            {
                std::cerr << "cannot open image." << std::endl;
                return 0;
            }

            if (ad_units_json.contains(std::to_string(i)))
            {
                cv::drawContours(im, std::vector<std::vector<cv::Point>>(1, convert_points(ad_units_json[std::to_string(i)]["unit"])), -1, cv::Scalar(0, 0, 255), 1, cv::LINE_AA);
            }

            vwtr.write(im);
        }

        vwtr.release();
    }

    delete esm_warp;
    delete esm_tracker;
    esm_warp = nullptr;
    esm_tracker = nullptr;
}
