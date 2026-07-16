#include "svf.h"
#include "cmt.h"
#include "utils.h"
#include "tracker-imp.h"

#include "decomposition.h"
#include "funcDef.h"
//#include "trackingSSD.h"
#include "vgg_interp2.h"
#include "ssdscale.h"
#include "constant.h"
#include "frame_extractor.h"
#include "frame_path_raii.h"

#include <chrono>
#include <thread>
#include <algorithm>
#include <cctype>
#include <locale>

#include <opencv2/core/utility.hpp>

#include <visp3/visp_core.h>
#include <visp3/tt/vpTemplateTrackerSSDESM.h>
#include <visp3/tt/vpTemplateTrackerWarpHomographySL3.h>
#include <visp3/tt/vpTemplateTrackerWarpSRT.h>

// Trim from the start (in place)
inline void ltrim(std::string &s) {
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), [](unsigned char ch) {
        return !std::isspace(ch);
    }));
}

// Trim from the end (in place)
inline void rtrim(std::string &s) {
    s.erase(std::find_if(s.rbegin(), s.rend(), [](unsigned char ch) {
        return !std::isspace(ch);
    }).base(), s.end());
}

// Trim from both ends (in place)
inline void trim(std::string &s) {
    ltrim(s);
    rtrim(s);
}

// Return the trimmed value that follows a short/long command-line flag, or an
// empty string if the flag is absent. Used as a workaround for known OpenCV
// CommandLineParser issues with these optional string arguments.
inline std::string getCommandLineOption(int argc, char **argv,
                                        const std::string &shortFlag,
                                        const std::string &longFlag) {
    for (int i = 1; i < argc - 1; ++i) {
        const std::string arg(argv[i]);
        if (arg == shortFlag || arg == longFlag) {
            std::string value(argv[i + 1]);
            trim(value);
            return value;
        }
    }
    return std::string();
}

int main(int argc, char **argv)
{
    cv::CommandLineParser parser(argc, argv,
                                 "{@cfg_file || input config file}"
                                 "{@data_folder || input data folder}"
                                 "{p pre_tracking || do tracking with ad unit detection, default to false}"
                                 "{t max_frame_length | -1 | max frame length for tracking, you can set this if a video is too long}"
                                 "{s suffix | png | input frame's file suffix}"
                                 "{v video_path | | input video path (override)}"
                                 "{f frames_root_folder | | frames root folder (optional, defaults to data_folder)}"
                                 "{h help || print help info}");

    if (parser.has("help"))
    {
        std::cout << "Usage : " << argv[0] << " [options]" << std::endl;
        std::cout << "Available options:" << std::endl;
        parser.printMessage();
        return 1;
    }
    bool bPreTracking = parser.get<bool>("pre_tracking");
    int maxFrameLengthForward = parser.get<int>("max_frame_length"); // for msn watch, you can set it to 900, 30s * 30 frames/s; this is a workaround to avoid long time tracking temporarily. Will revert after we have new solution.
    
    // Workaround for OpenCV parser issues: parse the suffix flag manually.
    std::string suffix = "png";  // default value
    std::string arg_suffix = getCommandLineOption(argc, argv, "-s", "--suffix");
    if (!arg_suffix.empty()) {
        suffix = arg_suffix;
    }

    std::string cfg_file = parser.get<std::string>("@cfg_file");
    std::string data_folder = parser.get<std::string>("@data_folder");
    if (data_folder[data_folder.size() - 1] != '/')
    {
        data_folder += "/";
    }

    // Set frames_root_folder: use provided value if given and not empty, otherwise use data_folder
    std::string frames_root_folder;
    
    // Workaround for OpenCV parser issues: parse the frames-root-folder flag manually.
    std::string arg_frames_root_folder = getCommandLineOption(argc, argv, "-f", "--frames_root_folder");

    if (!arg_frames_root_folder.empty()) {
        frames_root_folder = arg_frames_root_folder;
        if (frames_root_folder[frames_root_folder.size() - 1] != '/') {
            frames_root_folder += "/";
        }
        if (frames_root_folder[0] != '/') {
            frames_root_folder = "/" + frames_root_folder;
        }
    } else {
        frames_root_folder = data_folder;
    }
    std::cout << "frames_root_folder is: " << frames_root_folder << std::endl;

    json cfg_json;
    load_json_file(cfg_file, cfg_json);

    // get video meta
    json meta_json;
    load_json_file(data_folder + cfg_json["VIDEO_META"]["META_JSON"].get<std::string>(), meta_json);

    // derive video path and TS processing flag
    bool use_ts_processing = (cfg_json.contains("USE_TS_PROCESSING") ? cfg_json["USE_TS_PROCESSING"].get<bool>() : false);
    std::string video_path = data_folder + meta_json["video_name"].get<std::string>() + meta_json["video_ext"].get<std::string>();
    
    // Workaround for OpenCV parser issues: parse the video-path flag manually.
    std::string arg_video_path = getCommandLineOption(argc, argv, "-v", "--video_path");
    if (!arg_video_path.empty()) {
        video_path = arg_video_path;
    }

    if (!fs::exists(data_folder + cfg_json["AD_UNITS_TRACKING"]["MODIFIED_AD_UNITS_JSONS"].get<std::string>()))
    {
        fs::create_directory(data_folder + cfg_json["AD_UNITS_TRACKING"]["MODIFIED_AD_UNITS_JSONS"].get<std::string>());
    }

    // get time filter parameter
    int threshold_last_frames;
    if (cfg_json["AD_UNITS_EXTRACTION"].contains("THRESHOLD_LAST_SECONDS")) {
        threshold_last_frames = ceil(meta_json["fps"].get<float>() * cfg_json["AD_UNITS_EXTRACTION"]["THRESHOLD_LAST_SECONDS"].get<int>());
    } else {
        // support configuration parameter AD_UNITS_EXTRACTION.THRESHOLD_LAST_TIMES version < v4.6.2
        threshold_last_frames = cfg_json["AD_UNITS_EXTRACTION"]["THRESHOLD_LAST_TIMES"].get<int>();
    }
    std::cout << "Time filter threshold parameter for lasting frames " << threshold_last_frames << "\n";

    // load ad units
    // shots
    json shots_json;
    load_json_file(data_folder + cfg_json["AD_UNITS_EXTRACTION"]["AD_UNITS_JSONS"].get<std::string>() + "/" +
                       cfg_json["AD_UNITS_EXTRACTION"]["SHOTS_JSON"].get<std::string>(),
                   shots_json);
    std::vector<int> shots_start_frame;
    for (auto itr = shots_json.begin(); itr != shots_json.end(); ++itr)
    {
        shots_start_frame.push_back(std::stoi(itr.key()));
    }
    std::sort(shots_start_frame.begin(), shots_start_frame.end()); // increase order

    // units
    json ad_units_json;
    load_json_file(data_folder + cfg_json["AD_UNITS_EXTRACTION"]["AD_UNITS_JSONS"].get<std::string>() + "/" +
                       cfg_json["AD_UNITS_EXTRACTION"]["AD_UNITS_INSTANCES_JSON"].get<std::string>(),
                   ad_units_json);

    int n_instances = ad_units_json["n_instances"].get<int>();

    // scale
    float scale = 1.;
    float long_len = (float)std::max(meta_json["width"].get<int>(), meta_json["height"].get<int>());
    float short_len = (float)std::min(meta_json["width"].get<int>(), meta_json["height"].get<int>());
    scale = std::min(cfg_json["FRAME_MAX_LONG"].get<float>() / long_len, cfg_json["FRAME_MAX_SHORT"].get<float>() / short_len);

    float similarityThreshold = cfg_json["AD_UNITS_TRACKING"]["THRESHOLD_NCC_GOOD"].get<float>();

    // tracking
    for (int iid = 0; iid < n_instances; ++iid)
    {
        std::vector<cv::Point2f> unitForDrawing;
        bool usingReferenceForTracking = false;
        if (!ad_units_json["instance_updated"].contains(std::to_string(iid)))
        {
            ad_units_json["instance_updated"][std::to_string(iid)] = false;
            ad_units_json["instance_valid"][std::to_string(iid)] = false;
            ad_units_json["instance_score"][std::to_string(iid)] = 0.;
        }
        else
        {
            float avg_score = 0.;
            ad_units_json["instance_valid"][std::to_string(iid)] = false;
            ad_units_json["instance_score"][std::to_string(iid)] = avg_score;

            if (ad_units_json["instance_updated"][std::to_string(iid)].get<bool>() || bPreTracking)
            {
                std::vector<int> instance_start_end_frame = ad_units_json["instance_start_end_frame"][std::to_string(iid)].get<std::vector<int>>();

                // Check if the required keys exist in ad_units_instances before accessing
                std::string startFrameKey = std::to_string(instance_start_end_frame[0]);
                std::string iidKey = std::to_string(iid);
                if (!ad_units_json["ad_units_instances"].contains(startFrameKey) ||
                    !ad_units_json["ad_units_instances"][startFrameKey].contains(iidKey))
                {
                    std::cout << "Warning: ad_units_instances does not contain required keys for iid " << iid
                              << " (startFrame: " << startFrameKey << "), skipping..." << std::endl;
                    continue;
                }

                // Check if "unit" key exists
                if (!ad_units_json["ad_units_instances"][startFrameKey][iidKey].contains("unit"))
                {
                    std::cout << "Warning: 'unit' key not found for iid=" << iid
                              << " (startFrame: " << startFrameKey << "). Skipping..." << std::endl;
                    continue;
                }

                std::vector<cv::Point2f> unit;
                try
                {
                    unit = ad_units_json["ad_units_instances"][startFrameKey][iidKey]["unit"].get<std::vector<cv::Point2f>>();
                }
                catch (const std::exception& e)
                {
                    std::cout << "Warning: Failed to convert 'unit' to std::vector<cv::Point2f> for iid=" << iid
                              << " (startFrame: " << startFrameKey << "): " << e.what() << ". Skipping..." << std::endl;
                    continue;
                }

                // Validate unit shape: must be 4 points (4x2)
                if (unit.size() != 4)
                {
                    std::cout << "Warning: Invalid unit shape for iid=" << iid
                              << " (startFrame: " << startFrameKey << "): expected 4 points, got "
                              << unit.size() << ". Skipping..." << std::endl;
                    continue;
                }

                unitForDrawing = unit;
                ad_units_json["ad_units_instances"][startFrameKey][iidKey]["ncc_score"] = 1.;
                ad_units_json["ad_units_instances"][startFrameKey][iidKey]["cmt_confidence"] = 1.;

                // setup reference area for tracking
                if (ad_units_json.contains("instance_reference_objects") && ad_units_json["instance_reference_objects"].contains(std::to_string(iid)))
                {
                    // Check if "unit" key exists in reference objects
                    if (ad_units_json["instance_reference_objects"][std::to_string(iid)].contains("unit"))
                    {
                        std::vector<cv::Point2f> reference_unit;
                        try
                        {
                            reference_unit = ad_units_json["instance_reference_objects"][std::to_string(iid)]["unit"].get<std::vector<cv::Point2f>>();

                            // Validate reference unit shape: must be 4 points (4x2)
                            if (reference_unit.size() == 4)
                            {
                                unit = reference_unit;
                            }
                            else
                            {
                                std::cout << "Warning: Invalid reference unit shape for iid=" << iid
                                          << ": expected 4 points, got " << reference_unit.size()
                                          << ". Using original unit instead." << std::endl;
                                // Keep using the original unit (already validated above)
                            }
                        }
                        catch (const std::exception& e)
                        {
                            std::cout << "Warning: Failed to convert reference 'unit' to std::vector<cv::Point2f> for iid=" << iid
                                      << ": " << e.what() << ". Using original unit instead." << std::endl;
                            // Keep using the original unit (already validated above)
                        }
                    }
                    else
                    {
                        std::cout << "Warning: 'unit' key not found in reference objects for iid=" << iid
                                  << ". Using original unit instead." << std::endl;
                    }
                    assert(instance_start_end_frame[0] == ad_units_json["instance_reference_objects"][std::to_string(iid)]["frame"]);

                    usingReferenceForTracking = true;
                }

                avg_score += 1;

                vad::FramePathRAII fpath_im1_obj(
                    vad::get_target_frame_path_direct_optimized(
                        video_path, frames_root_folder , cfg_json["FRAMES_FOLDER"].get<std::string>(),
                        instance_start_end_frame[0], suffix, use_ts_processing),
                    frames_root_folder,
                    cfg_json["FRAMES_FOLDER"].get<std::string>(),
                    instance_start_end_frame[0]);
                std::string fpath_im1 = fpath_im1_obj.str();
                cv::Mat im1 = cv::imread(fpath_im1);
                if (im1.empty())
                {
                    std::cerr << "cannot open image." << std::endl;
                    return 1;
                }
                if (scale < 1.)
                {
                    cv::resize(im1, im1, cv::Size(), scale, scale, cv::INTER_AREA);

                    for (size_t uid = 0; uid < unit.size(); ++uid)
                    {
                        unit[uid] *= scale;
                        unitForDrawing[uid] *= scale;
                    }
                }

                int ref_unit_width = (int)std::round(std::max(cv::norm(unit[2] - unit[3]), cv::norm(unit[0] - unit[1])));
                int ref_unit_height = (int)std::round(std::max(cv::norm(unit[0] - unit[3]), cv::norm(unit[1] - unit[2])));

                cv::Mat im1_gray;
                cv::cvtColor(im1, im1_gray, cv::COLOR_BGR2GRAY);

                cv::Mat ref_front_view_gray;
                get_front_view(im1_gray, unit, ref_unit_width, ref_unit_height, ref_front_view_gray);

                // locate ad instance in shots
                int track_start_fid = 0;
                int track_end_fid = meta_json["n_frames"].get<int>();
                for (int sid = shots_start_frame.size() - 1; sid >= 0; --sid)
                {
                    if (instance_start_end_frame[0] >= shots_start_frame[sid])
                    {
                        track_start_fid = shots_start_frame[sid]; // included
                        if ((sid + 1) < (int)shots_start_frame.size())
                        {
                            track_end_fid = shots_start_frame[sid + 1]; // not included
                        }
                        break;
                    }
                }

                int ref_fid = instance_start_end_frame[0];

                // ref unit tracking with Wei's ESM
                if (usingReferenceForTracking)
                {
                    cv::Rect roi;
                    std::vector<cv::Mat> vInitPointsForDrawing;
                    vInitPointsForDrawing.resize(4);

                    ConvertToRect(unit, roi);
                    vInitPointsForDrawing[0] = (cv::Mat_<double>(3, 1) << unitForDrawing[0].x, unitForDrawing[0].y, 1);
                    vInitPointsForDrawing[1] = (cv::Mat_<double>(3, 1) << unitForDrawing[1].x, unitForDrawing[1].y, 1);
                    vInitPointsForDrawing[2] = (cv::Mat_<double>(3, 1) << unitForDrawing[2].x, unitForDrawing[2].y, 1);
                    vInitPointsForDrawing[3] = (cv::Mat_<double>(3, 1) << unitForDrawing[3].x, unitForDrawing[3].y, 1);

                    AdjustInitPoints(vInitPointsForDrawing, cv::Point(roi.x, roi.y));

                    double ratio(1);
                    int frame_width;
                    int frame_height;
                    cv::Mat showTemp;
                    cv::Mat temp = initTemplate(im1_gray, roi, ratio, frame_width, frame_height, showTemp);
                    int sizeX = temp.rows;
                    int sizeY = temp.cols;

                    cv::Mat H = (cv::Mat_<double>(3, 3) << 1, 0, roi.x / ratio, 0, 1, roi.y / ratio, 0, 0, 1);
                    cv::Mat gxTemp, gyTemp;
                    int success = Gradient(temp, gxTemp, gyTemp);

                    // tracking backward
                    int fid = ref_fid - 1;
                    if (cfg_json["AD_UNITS_TRACKING"]["TRACKING_BACKWARD"].get<bool>())
                    {
                        while (fid >= track_start_fid)
                        {
                            auto t_start = std::chrono::high_resolution_clock::now();

                            vad::FramePathRAII fpath_im2_obj(
                                vad::get_target_frame_path_direct_optimized(
                                    video_path, frames_root_folder, cfg_json["FRAMES_FOLDER"].get<std::string>(),
                                    fid, suffix, use_ts_processing),
                                frames_root_folder,
                                cfg_json["FRAMES_FOLDER"].get<std::string>(),
                                fid);
                            std::string fpath_im2 = fpath_im2_obj.str();
                            cv::Mat im2 = cv::imread(fpath_im2);
                            if (im2.empty())
                            {
                                std::cerr << "cannot open image." << std::endl;
                                return 1;
                            }
                            if (scale < 1.)
                            {
                                cv::resize(im2, im2, cv::Size(), scale, scale, cv::INTER_AREA);
                            }

                            cv::Mat im2_gray;
                            cv::cvtColor(im2, im2_gray, cv::COLOR_BGR2GRAY);

                            double scaleESM = 1, currentScaleESM = 1;

                            try
                            {
                                cv::resize(im2_gray, im2_gray, cv::Size(0, 0), 1 / ratio, 1 / ratio);
                                scaleESM = trackingSSD(H, im2_gray, temp, gxTemp, gyTemp, roi, ratio, currentScaleESM);

                                // tracked temp
                                std::vector<cv::Point2f> vRoiProjPoints;
                                DrawPoints(H, roi, ratio, vRoiProjPoints);
                                cv::Mat front_view_gray;
                                get_front_view(im2_gray, vRoiProjPoints, temp.cols, temp.rows, front_view_gray);
                                float similarity = std::max((float)0., ncc(showTemp, front_view_gray));
                                if (similarity < similarityThreshold)
                                {
                                    instance_start_end_frame[0] = fid + 1;
                                    if (cfg_json["DEBUG"].get<bool>())
                                    {
                                        std::cout << "##############" << std::endl;
                                        std::cout << "max similarity: " << similarity << std::endl;
                                        std::cout << "##############" << std::endl;
                                    }
                                    break;
                                }

                                std::vector<cv::Point2f> unit_hat;
                                DrawPoints(H, vInitPointsForDrawing, ratio, unit_hat);
                                std::vector<cv::Point2f> unit_hat_scaled(unit_hat);

                                if (scale < 1.)
                                {
                                    for (size_t uid = 0; uid < unit_hat_scaled.size(); ++uid)
                                    {
                                        unit_hat_scaled[uid] /= scale;
                                    }
                                }

                                ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["unit"] = json(unit_hat_scaled);

                                ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["ncc_score"] = similarity;
                                ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["cmt_confidence"] = 0;

                                avg_score += similarity;

                                auto t_end = std::chrono::high_resolution_clock::now();

                                if (cfg_json["DEBUG"].get<bool>())
                                {
                                    std::cout << "##############" << std::endl;
                                    std::cout << "ESM template: " << similarity << std::endl;
                                    std::cout << fid << " time: " << std::chrono::duration<float, std::milli>(t_end - t_start).count() << "ms" << std::endl;
                                    std::cout << "##############" << std::endl;
                                }

                                instance_start_end_frame[0] = fid;
                                fid -= 1;
                            }
                            catch (const std::exception &e)
                            {
                                std::cerr << e.what() << '\n';
                            }
                        }
                    }

                    // tracking forward
                    fid = ref_fid + 1;
                    if (maxFrameLengthForward > 0) 
                    {
                        track_end_fid = std::min(track_end_fid, ref_fid + maxFrameLengthForward); // a workaound, will update once we have better solution.
                    }

                    // reinit
                    temp = initTemplate(im1_gray, roi, ratio, frame_width, frame_height, showTemp);
                    sizeX = temp.rows;
                    sizeY = temp.cols;

                    H = (cv::Mat_<double>(3, 3) << 1, 0, roi.x / ratio, 0, 1, roi.y / ratio, 0, 0, 1);
                    success = Gradient(temp, gxTemp, gyTemp);

                    while (fid < track_end_fid)
                    {
                        auto t_start = std::chrono::high_resolution_clock::now();

                        vad::FramePathRAII fpath_im2_obj(
                            vad::get_target_frame_path_direct_optimized(
                                video_path, frames_root_folder, cfg_json["FRAMES_FOLDER"].get<std::string>(),
                                fid, suffix, use_ts_processing),
                            frames_root_folder,
                            cfg_json["FRAMES_FOLDER"].get<std::string>(),
                            fid);
                        std::string fpath_im2 = fpath_im2_obj.str();
                        cv::Mat im2 = cv::imread(fpath_im2);
                        if (im2.empty())
                        {
                            std::cerr << "cannot open image." << std::endl;
                            return 1;
                        }
                        if (scale < 1.)
                        {
                            cv::resize(im2, im2, cv::Size(), scale, scale, cv::INTER_AREA);
                        }

                        cv::Mat im2_gray;
                        cv::cvtColor(im2, im2_gray, cv::COLOR_BGR2GRAY);

                        double scaleESM = 1, currentScaleESM = 1;

                        try
                        {
                            cv::resize(im2_gray, im2_gray, cv::Size(0, 0), 1 / ratio, 1 / ratio);
                            scaleESM = trackingSSD(H, im2_gray, temp, gxTemp, gyTemp, roi, ratio, currentScaleESM);

                            // tracked temp
                            std::vector<cv::Point2f> vRoiProjPoints;
                            DrawPoints(H, roi, ratio, vRoiProjPoints);
                            cv::Mat front_view_gray;
                            get_front_view(im2_gray, vRoiProjPoints, temp.cols, temp.rows, front_view_gray);
                            float similarity = std::max((float)0., ncc(showTemp, front_view_gray));
                            if (similarity < similarityThreshold)
                            {
                                instance_start_end_frame[1] = fid - 1;
                                if (cfg_json["DEBUG"].get<bool>())
                                {
                                    std::cout << "##############" << std::endl;
                                    std::cout << "max similarity: " << similarity << std::endl;
                                    std::cout << "##############" << std::endl;
                                }
                                break;
                            }

                            std::vector<cv::Point2f> unit_hat;
                            DrawPoints(H, vInitPointsForDrawing, ratio, unit_hat);
                            std::vector<cv::Point2f> unit_hat_scaled(unit_hat);

                            if (scale < 1.)
                            {
                                for (size_t uid = 0; uid < unit_hat_scaled.size(); ++uid)
                                {
                                    unit_hat_scaled[uid] /= scale;
                                }
                            }

                            ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["unit"] = json(unit_hat_scaled);

                            ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["ncc_score"] = similarity;
                            ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["cmt_confidence"] = 0;

                            avg_score += similarity;

                            auto t_end = std::chrono::high_resolution_clock::now();

                            if (cfg_json["DEBUG"].get<bool>())
                            {
                                std::cout << "##############" << std::endl;
                                std::cout << "ESM template: " << similarity << std::endl;
                                std::cout << fid << " time: " << std::chrono::duration<float, std::milli>(t_end - t_start).count() << "ms" << std::endl;
                                std::cout << "##############" << std::endl;
                            }

                            instance_start_end_frame[1] = fid;
                            fid += 1;
                        }
                        catch (const std::exception &e)
                        {
                            std::cerr << e.what() << '\n';
                        }
                    }
                    // update start end frame
                    ad_units_json["instance_start_end_frame"][std::to_string(iid)] = instance_start_end_frame;

                    if ((instance_start_end_frame[1] - instance_start_end_frame[0] + 1) >= threshold_last_frames)
                    {
                        avg_score /= instance_start_end_frame[1] - instance_start_end_frame[0] + 1;
                        ad_units_json["instance_valid"][std::to_string(iid)] = true;
                        ad_units_json["instance_score"][std::to_string(iid)] = avg_score;
                    }
                    else {
                        std::cout << "[usingReferenceForTracking] time filter set invalid: ad unit " << std::to_string(iid) << ", duration frames " << instance_start_end_frame[1] - instance_start_end_frame[0] + 1 << " less than " << threshold_last_frames << "\n";
                    }
                }
                else // otherwise
                {
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
                    if (kpts_ref.size() > 0)
                    {
                        detector->compute(im1, kpts_ref, descs_ref);
                        if (cfg_json["AD_UNITS_TRACKING"]["ROOTSIFT"].get<bool>())
                        {
                            rootSift(descs_ref);
                        }
                    }

                    // cmt
                    CMT cmt_tracker_backward, cmt_tracker_forward;
                    cmt_tracker_backward.consensus.estimate_scale = cfg_json["AD_UNITS_TRACKING"]["CMT_ESTIMATE_SCALE"].get<bool>();
                    cmt_tracker_backward.consensus.estimate_rotation = cfg_json["AD_UNITS_TRACKING"]["CMT_ESTIMATE_ROTATION"].get<bool>();
                    cmt_tracker_backward.initialize(im1_gray, unit);
                    cmt_tracker_forward.consensus.estimate_scale = cfg_json["AD_UNITS_TRACKING"]["CMT_ESTIMATE_SCALE"].get<bool>();
                    cmt_tracker_forward.consensus.estimate_rotation = cfg_json["AD_UNITS_TRACKING"]["CMT_ESTIMATE_ROTATION"].get<bool>();
                    cmt_tracker_forward.initialize(im1_gray, unit);

                    // start tracking
                    vpImage<unsigned char> vp_im2, vp_im_gray2;

                    std::vector<cv::Mat> H;
                    H.assign(n_trackers, cv::Mat());

                    std::vector<std::vector<cv::Point2f>> unit_hat;
                    unit_hat.assign(n_trackers, std::vector<cv::Point2f>());

                    std::vector<cv::Mat> front_view_gray;
                    front_view_gray.assign(n_trackers, cv::Mat());

                    std::vector<float> similarity;
                    similarity.assign(n_trackers, 0.0);

                    // tracking backward
                    int fid = ref_fid - 1;
                    if (cfg_json["AD_UNITS_TRACKING"]["TRACKING_BACKWARD"].get<bool>())
                    {
                        while (fid >= track_start_fid)
                        {
                            auto t_start = std::chrono::high_resolution_clock::now();

                            vad::FramePathRAII fpath_im2_obj(
                                vad::get_target_frame_path_direct_optimized(
                                    video_path, frames_root_folder, cfg_json["FRAMES_FOLDER"].get<std::string>(),
                                    fid, suffix, use_ts_processing),
                                frames_root_folder,
                                cfg_json["FRAMES_FOLDER"].get<std::string>(),
                                fid);
                            std::string fpath_im2 = fpath_im2_obj.str();
                            cv::Mat im2 = cv::imread(fpath_im2);
                            if (im2.empty())
                            {
                                std::cerr << "cannot open image." << std::endl;
                                return 1;
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

                            std::thread t3(cmt_tracker_imp, std::ref(im2_gray), std::ref(ref_front_view_gray), std::ref(unit), ref_unit_width, ref_unit_height, std::ref(cmt_tracker_backward),
                                           std::ref(H[2]), std::ref(unit_hat[2]), std::ref(front_view_gray[2]), std::ref(similarity[2]));

                            t1.join();
                            t2.join();
                            t3.join();

                            auto t_mid = std::chrono::high_resolution_clock::now();

                            // get max similarity id
                            int max_id = std::distance(similarity.begin(), std::max_element(similarity.begin(), similarity.end()));
                            if (similarity[max_id] < similarityThreshold)
                            {
                                instance_start_end_frame[0] = fid + 1;
                                if (cfg_json["DEBUG"].get<bool>())
                                {
                                    std::cout << "##############" << std::endl;
                                    std::cout << "max similarity: " << similarity[max_id] << std::endl;
                                    std::cout << "##############" << std::endl;
                                }
                                break;
                            }

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

                            std::vector<cv::Point2f> unit_hat_scaled(unit_hat[max_id]);
                            cv::Mat HSelected = H[max_id];
                            if (usingReferenceForTracking)
                            {
                                cv::perspectiveTransform(unitForDrawing, unit_hat_scaled, HSelected);
                            }

                            if (scale < 1.)
                            {
                                for (size_t uid = 0; uid < unit_hat_scaled.size(); ++uid)
                                {
                                    unit_hat_scaled[uid] /= scale;
                                }
                            }

                            ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["unit"] = json(unit_hat_scaled);

                            ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["ncc_score"] = similarity[max_id];
                            ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["cmt_confidence"] = cmt_tracker_backward.confidence;

                            avg_score += similarity[max_id];

                            auto t_end = std::chrono::high_resolution_clock::now();

                            if (cfg_json["DEBUG"].get<bool>())
                            {
                                std::cout << "##############" << std::endl;
                                std::cout << "template: " << similarity[0] << ", sift:" << similarity[1] << " cmt: " << similarity[2] << std::endl;
                                std::cout << "cmt_confidence: " << cmt_tracker_backward.confidence << std::endl;

                                if (similarity[max_id] > 0)
                                {
                                    cv::imshow("front view", front_view_gray[max_id]);
                                }
                                std::cout << max_id << std::endl;

                                std::cout << fid << " time: " << std::chrono::duration<float, std::milli>(t_end - t_start).count() << "ms" << std::endl;
                                std::cout << "##############" << std::endl;
                            }

                            instance_start_end_frame[0] = fid;
                            fid -= 1;
                        }
                    }

                    // tracking forward
                    fid = ref_fid + 1;
                    if (maxFrameLengthForward > 0)
                    {
                        track_end_fid = std::min(track_end_fid, ref_fid + maxFrameLengthForward); // a workaound, will update once we have better solution.
                    }

                    esm_tracker->resetTracker();
                    esm_tracker->initFromPoints(vp_im_gray, v_ip, false);

                    while (fid < track_end_fid)
                    {
                        auto t_start = std::chrono::high_resolution_clock::now();

                        vad::FramePathRAII fpath_im2_obj(
                            vad::get_target_frame_path_direct_optimized(
                                video_path, frames_root_folder, cfg_json["FRAMES_FOLDER"].get<std::string>(),
                                fid, suffix, use_ts_processing),
                            frames_root_folder,
                            cfg_json["FRAMES_FOLDER"].get<std::string>(),
                            fid);
                        std::string fpath_im2 = fpath_im2_obj.str();
                        cv::Mat im2 = cv::imread(fpath_im2);
                        if (im2.empty())
                        {
                            std::cerr << "cannot open image." << std::endl;
                            return 1;
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

                        std::thread t3(cmt_tracker_imp, std::ref(im2_gray), std::ref(ref_front_view_gray), std::ref(unit), ref_unit_width, ref_unit_height, std::ref(cmt_tracker_forward),
                                       std::ref(H[2]), std::ref(unit_hat[2]), std::ref(front_view_gray[2]), std::ref(similarity[2]));

                        t1.join();
                        t2.join();
                        t3.join();

                        auto t_mid = std::chrono::high_resolution_clock::now();

                        // get max similarity id
                        int max_id = std::distance(similarity.begin(), std::max_element(similarity.begin(), similarity.end()));
                        if (similarity[max_id] < similarityThreshold)
                        {
                            instance_start_end_frame[1] = fid - 1;
                            if (cfg_json["DEBUG"].get<bool>())
                            {
                                std::cout << "##############" << std::endl;
                                std::cout << "max similarity: " << similarity[max_id] << std::endl;
                                std::cout << "##############" << std::endl;
                            }
                            break;
                        }

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

                        std::vector<cv::Point2f> unit_hat_scaled(unit_hat[max_id]);
                        cv::Mat HSelected = H[max_id];
                        if (usingReferenceForTracking)
                        {
                            cv::perspectiveTransform(unitForDrawing, unit_hat_scaled, HSelected);
                        }

                        if (scale < 1.)
                        {
                            for (size_t uid = 0; uid < unit_hat_scaled.size(); ++uid)
                            {
                                unit_hat_scaled[uid] /= scale;
                            }
                        }

                        ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["unit"] = json(unit_hat_scaled);

                        ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["ncc_score"] = similarity[max_id];
                        ad_units_json["ad_units_instances"][std::to_string(fid)][std::to_string(iid)]["cmt_confidence"] = cmt_tracker_forward.confidence;

                        avg_score += similarity[max_id];

                        auto t_end = std::chrono::high_resolution_clock::now();

                        if (cfg_json["DEBUG"].get<bool>())
                        {
                            std::cout << "##############" << std::endl;
                            std::cout << "template: " << similarity[0] << ", sift:" << similarity[1] << " cmt: " << similarity[2] << std::endl;
                            std::cout << "cmt_confidence: " << cmt_tracker_forward.confidence << std::endl;

                            std::cout << max_id << std::endl;

                            std::cout << fid << " time: " << std::chrono::duration<float, std::milli>(t_end - t_start).count() << "ms" << std::endl;
                            std::cout << "##############" << std::endl;
                        }

                        instance_start_end_frame[1] = fid;
                        fid += 1;
                    }

                    // update start end frame
                    ad_units_json["instance_start_end_frame"][std::to_string(iid)] = instance_start_end_frame;

                    if ((instance_start_end_frame[1] - instance_start_end_frame[0] + 1) >= threshold_last_frames)
                    {
                        avg_score /= instance_start_end_frame[1] - instance_start_end_frame[0] + 1;
                        ad_units_json["instance_valid"][std::to_string(iid)] = true;
                        ad_units_json["instance_score"][std::to_string(iid)] = avg_score;
                    }
                    else {
                        std::cout << "time filter set invalid: ad unit " << std::to_string(iid) << ", duration frames " << instance_start_end_frame[1] - instance_start_end_frame[0] + 1 << " less than " << threshold_last_frames << "\n";
                    }

                    delete esm_warp;
                    delete esm_tracker;
                    esm_warp = nullptr;
                    esm_tracker = nullptr;
                }
            }
        }
    }

    // filter out overlapped instances
    for (int fid = 0; fid < meta_json["n_frames"].get<int>(); ++fid)
    {
        if (ad_units_json["ad_units_instances"].contains(std::to_string(fid)))
        {
            std::vector<cv::Rect> bbox;
            std::vector<std::string> instances;
            std::vector<float> scores;

            for (auto itr = ad_units_json["ad_units_instances"][std::to_string(fid)].begin(); itr != ad_units_json["ad_units_instances"][std::to_string(fid)].end(); ++itr)
            {
                if (ad_units_json["instance_valid"][itr.key()].get<bool>())
                {
                    std::vector<cv::Point2f> unit = ad_units_json["ad_units_instances"][std::to_string(fid)][itr.key()]["unit"];
                    bbox.push_back(cv::boundingRect(unit));
                    instances.push_back(itr.key());
                    scores.push_back(ad_units_json["instance_score"][itr.key()].get<float>());
                }
            }

            if (bbox.size() > 1)
            {
                std::vector<size_t> indices = ordered_indices(scores);
                for (size_t iid = 1; iid < indices.size(); ++iid)
                {
                    for (size_t sub_iid = 0; sub_iid < iid; ++sub_iid)
                    {
                        if (ad_units_json["instance_valid"][instances[indices[sub_iid]]].get<bool>())
                        {
                            if (intersection_over_union(bbox[indices[iid]], bbox[indices[sub_iid]]) > 0)
                            {
                                ad_units_json["instance_valid"][instances[indices[iid]]] = false;
                                std::cout << "frame " << fid << ": " << instances[indices[sub_iid]] << ", and " << instances[indices[iid]] << " intersect with each other, set invalid to " << instances[indices[iid]] << "\n";
                            }
                        }
                    }
                }
            }

            bbox.clear();
            instances.clear();
            scores.clear();
        }
    }

    string strJsonOutput = data_folder + cfg_json["AD_UNITS_TRACKING"]["MODIFIED_AD_UNITS_JSONS"].get<std::string>() +
                       "/" + cfg_json["AD_UNITS_TRACKING"]["AD_UNITS_INSTANCES_JSON"].get<std::string>();
    // for pre-tracking, we don't need so much details of ad units
    if (bPreTracking)
    {
        // Keep ad_units_instances details here; they are reused later for occlusion detection.
        string strJsonFileName = "tracking_result_for_detection.json"; // default name
        if (cfg_json["AD_UNITS_TRACKING"].contains("TRACKING_RESULT_FOR_DETECTION"))
            strJsonFileName = cfg_json["AD_UNITS_TRACKING"]["TRACKING_RESULT_FOR_DETECTION"].get<std::string>();

        strJsonOutput = data_folder + cfg_json["AD_UNITS_TRACKING"]["MODIFIED_AD_UNITS_JSONS"].get<std::string>() + "/" + strJsonFileName;
    }

    std::fstream f(strJsonOutput, std::ios::out);

    f << std::setw(4) << ad_units_json << std::endl;

    f.close();

    std::cout << ad_units_json << std::endl;

    return 0;
}