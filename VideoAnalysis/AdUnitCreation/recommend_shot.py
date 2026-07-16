import argparse
import json
import logging
import os
import sys

import cv2
import numpy as np

from AdUnitCreation.detectron2_data_utils import detectron2_read_image
from VADProcessing.Utils.FileUtils import dumpJson
sys.path.append(os.path.join(os.path.dirname(__file__), os.pardir))
from Shared.util import cfg_from_jsonfile, show_image, save_show, close_show, show_mask, add_text_to_image
from Shared.frame_utils import get_frame_path
from Shared.frame_path_raii import FramePathRAII

from PipelineModelProcess.ShotRecommendationEngine import ShotRecommendationEngine
from definitions import VIDEO_SECONDS_THRES, VIDEO_ENDING_RATE, VIDEO_START_TIME

_debug = False

def draw_rectangle(img, rectangle, color=(0, 255, 0)):
    """
    rectangle = [lt_point, rt_point, rb_point, lb_point]
    """
    lt_point, rt_point, rb_point, lb_point = rectangle
    cv2.line(img, tuple(np.array(lt_point).astype(int)), tuple(np.array(rt_point).astype(int)), color, 2)
    cv2.line(img, tuple(np.array(rt_point).astype(int)), tuple(np.array(rb_point).astype(int)), color, 2)
    cv2.line(img, tuple(np.array(rb_point).astype(int)), tuple(np.array(lb_point).astype(int)), color, 2)
    cv2.line(img, tuple(np.array(lb_point).astype(int)), tuple(np.array(lt_point).astype(int)), color, 2)

def is_suitable_shot(cfg, mid_frame_id, shot_length, is_long_video, model):
    result = {"recommend": False, "score": 0, "plane_id_masks": []}
    # check time constraint
    fps = cfg.VIDEO_FPS
    shot_time_inverval = shot_length / fps
    if shot_time_inverval < cfg.AD_UNITS_EXTRACTION.THRESHOLD_LAST_SECONDS:
        return result
    
    # load image
    # image_file = get_frame_path(cfg.DATA_FOLDER, cfg.FRAMES_FOLDER, str(mid_frame_id))
    image_file_raii = FramePathRAII(cfg.VIDEO_PATH, cfg.FRAMES_ROOT_FOLDER, cfg.FRAMES_FOLDER, mid_frame_id, use_ts_processing = cfg.USE_TS_PROCESSING)
    image_file = str(image_file_raii)
    img, ori_width, ori_height = detectron2_read_image(image_file, format="RGB", min_size=480)
    height, width, _ = img.shape

    # segment specific category region, e.g. wall etc.
    area_ratio_thres = cfg.AD_UNITS_CREATION_EXTRACTION.REGION_AREA_RATIO_MIN
    input_data = model.pre_process((img, area_ratio_thres))
    output = model.dlis_inference_request(input_data)
    #print(output)

    # save output to pickle file
    if _debug:
        import pickle
        output_file = os.path.join(cfg.DATA_FOLDER, str(mid_frame_id) + '_shot_recommend_output.pkl')
        with open(output_file, 'wb') as f:
            pickle.dump(output, f)
    if _debug:
        # load from pickle file
        import pickle
        output_file = os.path.join(cfg.DATA_FOLDER, str(mid_frame_id) + '_shot_recommend_output.pkl')
        with open(output_file, 'rb') as f:
            output = pickle.load(f)
    result = model.post_process(output)
    result["origin_img_size"] = (ori_height, ori_width)
    result["current_img_size"] = (height, width)

    # optimize rectangle aspect ratio
    standard_aspect_ratios = [area_ratio for area_ratio in cfg.AD_UNITS_CREATION_EXTRACTION.STANDARD_ASPECT_RATIOS if area_ratio > 0]
    result["ori_rectangle"] = result["rectangle"]
    result["rectangle"] = align_rectangle_aspect_ratio(result["rectangle"], standard_aspect_ratios)

    # save image
    #recommend = result["recommend"]
    #file_name = f"{mid_frame_id}_{recommend}.jpg"
    #cv2.imwrite(file_name, img)
    #print(file_name)
    #print(result)

    return result

def decrease_segment(s_point, e_point, length):
    '''
    decrease segment length by given length
    '''
    direct = np.array(e_point) - np.array(s_point)
    direct = direct / np.linalg.norm(direct) * length
    e_point = np.array(s_point) + direct
    return e_point.tolist()

def align_rectangle_aspect_ratio(rectangle, standard_aspect_ratios):
    '''
    align rectangle aspect ratio to standard aspect ratio
    '''
    
    if rectangle is not None:
        lt_point, rt_point, rb_point, lb_point = rectangle

        # check the shape of rectangle
        width = np.linalg.norm(np.array(lt_point) - np.array(rt_point))
        height = np.linalg.norm(np.array(lt_point) - np.array(lb_point))
        if width == 0 or height == 0:
            return None
        if np.linalg.norm(np.array(rb_point) - np.array(lb_point)) == 0 or np.linalg.norm(np.array(rt_point) - np.array(rb_point)) == 0:
            return None

        # approximate aspect ratio by the same calculation with rendering module
        aspect_ratio = width / height
    else:
        return None

    # find the best aspect ratio
    best_aspect_ratio = 0
    min_diff = 100
    for standard_aspect_ratio in standard_aspect_ratios:
        diff = abs(aspect_ratio - standard_aspect_ratio)
        if diff < min_diff:
            min_diff = diff
            best_aspect_ratio = standard_aspect_ratio

    # deal with unnormal standard aspect ratio
    if best_aspect_ratio == 0:
        return rectangle

    # adjust rectangle
    if aspect_ratio > best_aspect_ratio:
        # decrease width
        width_new = height * best_aspect_ratio
        width_b = np.linalg.norm(np.array(lb_point) - np.array(rb_point))
        width_b_new = width_new * width_b / width
        rt_point = decrease_segment(lt_point, rt_point, width_new)
        rb_point = decrease_segment(lb_point, rb_point, width_b_new)
    elif aspect_ratio < best_aspect_ratio:
        # decrease height
        height_new = width / best_aspect_ratio
        height_r = np.linalg.norm(np.array(rt_point) - np.array(rb_point))
        height_r_new = height_new * height_r / height
        lb_point = decrease_segment(lt_point, lb_point, height_new)
        rb_point = decrease_segment(rt_point, rb_point, height_r_new)
    rectangle = [lt_point, rt_point, rb_point, lb_point]
    
    return rectangle


def recommend_shot(cfg):
    # prepare aspect ratio value
    standard_width_heights= cfg.AD_UNITS_CREATION_EXTRACTION.STANDARD_WIDTH_HEIGHT
    standard_aspect_ratios = [width / height for width, height in standard_width_heights if width > 0 and height > 0]
    cfg.AD_UNITS_CREATION_EXTRACTION.STANDARD_ASPECT_RATIOS = standard_aspect_ratios

    # create folder
    folder = os.path.join(cfg.DATA_FOLDER, cfg.AD_UNITS_CREATION_EXTRACTION.RECOMMEND_SHOT_VISUALIIZE_FOLDER)
    os.makedirs(folder, exist_ok=True)

    # load shot info
    shot_json_file = os.path.join(cfg.DATA_FOLDER, cfg.AD_UNITS_EXTRACTION.AD_UNITS_JSONS, cfg.AD_UNITS_EXTRACTION.SHOTS_JSON)
    with open(shot_json_file, 'r') as f:
        shots = json.load(f)
    shot_boundary = [int(frame) for frame in shots.keys()]

    # get shot length
    shot_length = []
    for i in range(len(shot_boundary) - 1):
        shot_length.append(shot_boundary[i + 1] - shot_boundary[i])
    shot_length.append(cfg.VIDEO_N_FRAMES - shot_boundary[-1])

    # get shot index in shot_boundary, in the order of shot length from long to short
    shot_index = sorted(range(len(shot_length)), key=lambda k: shot_length[k], reverse=True)

    # recommend model
    model = ShotRecommendationEngine()

    # keep N shots, where N = cfg.AD_UNITS_CREATION_EXTRACTION.RECOMMEND_SHOT_NUMBER    
    fps = cfg.VIDEO_FPS
    n_frames = cfg.VIDEO_N_FRAMES
    n_seconds = n_frames / fps
    is_long_video = n_seconds > VIDEO_SECONDS_THRES # 35 min
    video_ending_rate = VIDEO_ENDING_RATE # 0.1, 10% of video length
    video_start_time = VIDEO_START_TIME # 2 min
    if is_long_video:
        content_start_frame_id = int(video_start_time * fps)
        n_frames_without_ending = int(n_frames * (1 - video_ending_rate))
    frame_list = []
    for shot_i in shot_index:
        if len(frame_list) < cfg.AD_UNITS_CREATION_EXTRACTION.RECOMMEND_SHOT_NUMBER:
            if shot_i == len(shot_boundary) - 1:
                mid_frame_id = int((shot_boundary[shot_i] + n_frames) / 2)
            else:
                mid_frame_id = int((shot_boundary[shot_i] + shot_boundary[shot_i + 1]) / 2)
            # for >=35 min long video, ignore ending video_ending_rate part to skip ending song, ignore first 2 min to skip starting song
            if is_long_video and (mid_frame_id >= n_frames_without_ending or mid_frame_id <= content_start_frame_id):
                continue
            #if mid_frame_id not in [26576, 22982, 26852]:
            #    continue
            try:
                result = is_suitable_shot(cfg, mid_frame_id, shot_length[shot_i], is_long_video, model)
                if result["recommend"] and result["rectangle"] is not None:
                    frame_list.append({"frame_id": mid_frame_id,
                                        "score": result["score"],
                                        "plane_id_masks": result["plane_id_masks"], 
                                        "rectangle": result["rectangle"],
                                        "ori_rectangle": result["ori_rectangle"],
                                        "origin_img_size": result["origin_img_size"],
                                        "current_img_size": result["current_img_size"]})
                    #print(len(frame_list), mid_frame_id, result["score"])
            except Exception as e:
                image_file = get_frame_path(cfg.FRAMES_ROOT_FOLDER, cfg.FRAMES_FOLDER, str(mid_frame_id))
                logging.error(f"Error(fail) in shot {shot_i}, frame {mid_frame_id}({image_file}): {e}, {logging.traceback.format_exc()}")
        else:
            break
    logging.info(f"Recommend shot number: {len(frame_list)}, total shot number: {len(shot_boundary)}")

    # sort frame_list by score in descending order
    frame_list = sorted(frame_list, key=lambda k: k['score'], reverse=True)

    # save middle frame in recommend shots to json
    recommend_shot = dict()
    recommend_shot['frame_list'] = [frame['frame_id'] for frame in frame_list]
    recommend_shot['rectangle_list'] = []
    for frame in frame_list:
        plane_id_masks = frame['plane_id_masks']
        # draw plane id map
        # image_file = get_frame_path(cfg.DATA_FOLDER, cfg.FRAMES_FOLDER, str(frame['frame_id']))
        image_file_raii = FramePathRAII(cfg.VIDEO_PATH, cfg.FRAMES_ROOT_FOLDER, cfg.FRAMES_FOLDER, frame['frame_id'], use_ts_processing = cfg.USE_TS_PROCESSING)
        image_file = str(image_file_raii)
        img_rgb, _, _ = detectron2_read_image(image_file, format="RGB", min_size=480)
        if frame['rectangle'] is not None:
            draw_rectangle(img_rgb, frame['rectangle'])
        if frame['ori_rectangle'] is not None:
            draw_rectangle(img_rgb, frame['ori_rectangle'], (0, 0, 255))
        show_image(img_rgb)
        for i in range(0, len(plane_id_masks)):
            show_mask(plane_id_masks[i].astype(bool))
            # get the left-top point in plane_id_masks with non-zero value
            y, x = (plane_id_masks[i] > 0).nonzero()
            if len(y) > 0:
                y = y[0]
                x = x[0]
                # add text to image
                text = f"plane_{i}"
                add_text_to_image(text, (x,y))
        plane_id_map_file = get_frame_path(cfg.DATA_FOLDER, cfg.AD_UNITS_CREATION_EXTRACTION.RECOMMEND_SHOT_VISUALIIZE_FOLDER, str(frame['frame_id']))
        save_show(plane_id_map_file)
        close_show()

        # resize rectangle to original image size
        height, width = frame["current_img_size"]
        ori_height, ori_width = frame["origin_img_size"]
        if frame["rectangle"] != None:
            for point in frame["rectangle"]:
                point[0] = point[0] * ori_width / width
                point[1] = point[1] * ori_height / height
        recommend_shot['rectangle_list'].append(frame["rectangle"])

    json_file = os.path.join(cfg.DATA_FOLDER, cfg.AD_UNITS_CREATION_EXTRACTION.AD_UNITS_JSONS, cfg.AD_UNITS_CREATION_EXTRACTION.RECOMMEND_SHOT_JSON)
    dumpJson(json_file, recommend_shot)


if __name__ == "__main__":
    logging_format = "%(asctime)-15s %(levelname)s [%(pathname)s:%(lineno)d] p[%(process)s]  %(message)s"
    logging.basicConfig(format=logging_format, level=logging.INFO)

    from Shared.extracting_ad_units import run_shot_detection, parse_args, parse_cfg
    args = parse_args()
    cfg = parse_cfg(args)
    #run_shot_detection(cfg)
    recommend_shot(cfg)
