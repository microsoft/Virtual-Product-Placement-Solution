import os
import cv2
import sys
import subprocess
from Shared.matcherlib import LoFTR_initialize, LoFTR_Detect_process
from predict import predict, initialize_model
#from mmdet.apis import inference_detector, init_detector
from AdUnitCreation.move_object_cls import move_object_class
import numpy as np
from CommonLib import Logger, PerfProfiler
import logging
import argparse
from Shared.util import cfg_from_jsonfile
import json
from VADProcessing.Utils.FileUtils import dumpJson
def parse_args():
    parser = argparse.ArgumentParser(description='extracting ad units')
    parser.add_argument('--cfg', dest='cfg_file', default='./src/cfgs/default.json',
                        help='config file')
    parser.add_argument('--data_folder', default='./data',
                        help='data folder')
    parser.add_argument('--detection', default='true',
                        help='detection enabled')
    parser.add_argument('--reconstruction', default='false',
                        help='reconstruction enabled')
    parser.add_argument('--ffprobe', default='ffprobe',
                        help='ffprobe path')
    parser.add_argument('--pre_tracking', default='false',
                        help='do tracking in advance along with detection')
    parser.add_argument('--code_path', default='/functions',
                        help='root code path')
    parser.add_argument('--group_optimization', default='false',
                        help='do group optimization in advance along with detection')
    parser.add_argument('--is_enable_senet_inference', default='false',
                        help='senet disabled')


    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)

    args = parser.parse_args()
    return args


class point:
    def __init__(self,x,y):
        self.x = x
        self.y = y
    def __eq__(self,other):
        if isinstance(other, self.__class__):
            return self.x == other.x and self.y == other.y
        return False
    def __ne__(self,other):
        return not self.__eq__(other)
    
    def __hash__(self):
        return hash(self.x * 5000 + self.y)
    


def detect_move_object_mask(shots):
    pass

def get_frame_list_using_second_seperation(n_frame, fps, second = 1):
    n_frame = n_frame
    frame_list_one_second = list()
    cur_frame = 0
    while(cur_frame < n_frame):
        frame_list_one_second.append(cur_frame)
        cur_frame = round(cur_frame + fps)
    
    return frame_list_one_second

def delete_unplane_datapoints(segment_result, idx_to_class_dict, keypoints1, keypoints2):
    result_keypoints1 = list()
    result_keypoints2 = list()
    # keypoints1/2 are from loftr which had been resized to (640*480).
    # We should scale them to match the size of segment_result
    original_width = segment_result.shape[1]
    original_height = segment_result.shape[0]
    loftr_width = 640
    loftr_height = 480
    for idx in range(len(keypoints1)):
        row = int(np.round(keypoints1[idx][1] / loftr_height * original_height))
        col = int(np.round(keypoints1[idx][0] / loftr_width * original_width))
        if segment_result[row][col] in idx_to_class_dict:
            result_keypoints1.append(keypoints1[idx])
            result_keypoints2.append(keypoints2[idx])

    result_keypoints1 = np.array(result_keypoints1)
    result_keypoints2 = np.array(result_keypoints2)
    return result_keypoints1, result_keypoints2

def parse_cfg(args):
    if args.cfg_file is None or not os.path.exists(args.cfg_file):
        logging.error(f"ERROR! args.cfg_file does not exist: {args.cfg_file}")
        return None
    
    cfg = cfg_from_jsonfile(args)
    return cfg

def detect_movement(src, dst, min_keypoint_count_th):
    # could be shot changes. we should regard the previous frame (frame_id) as moved
    if len(src) <= min_keypoint_count_th or len(dst) <= min_keypoint_count_th:
        return True

    M, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    if M is None:
        return True

    I = np.identity(3)
    delta = I - M
    delta = delta.T @ delta
    tr = delta.trace()
    return tr > 3.0

def proceed_freeze_frame_detect(args):
    
    cfg = parse_cfg(args)
    if cfg is None:
        return

    frame_folder = os.path.join(cfg.DATA_FOLDER, cfg.FRAMES_FOLDER)
    
    
    if not os.path.exists(os.path.join(cfg.DATA_FOLDER, cfg.AD_UNITS_CREATION_EXTRACTION.AD_UNITS_JSONS)):
        os.mkdir(os.path.join(cfg.DATA_FOLDER, cfg.AD_UNITS_CREATION_EXTRACTION.AD_UNITS_JSONS))
    
    fps = cfg.VIDEO_FPS
    n_frames = cfg.VIDEO_N_FRAMES
    
    frame_list_one_second = get_frame_list_using_second_seperation(n_frames,fps,1)
    frame_continue_time_thre = 5
    min_keypoint_count_th = 100
    config = f'{cfg.CODE_PATH}/ViT-Adapter/segmentation/configs/ade20k/mask2former_beitv2_adapter_large_896_80k_ade20k_ss.py'
    checkpoint = f'{cfg.CODE_PATH}/ViT-Adapter/checkpoints/mask2former_beitv2_adapter_large_896_80k_ade20k.pth'
    model = initialize_model(config,checkpoint,'ade')
    LOFTR = LoFTR_initialize()
    idx_to_class_dict = dict()
    idx_to_class_dict[0] = 'wall'
    idx_to_class_dict[11] = 'sidewalk'
    frame_idx = 0
    result_frame_list = list()

    while frame_idx < len(frame_list_one_second):
        frame_list = list()
        frame_id = frame_list_one_second[frame_idx]
        img = cv2.imread(os.path.join(frame_folder, f'{frame_id}.jpg'))
        # test a single image
        result = predict(model,img)[0]
        frame_list.append(frame_id)
        frame_idx += 1
        
        while frame_idx < len(frame_list_one_second):
            img1_path = f'{frame_folder}/{frame_id}.jpg'
            img2_path = f'{frame_folder}/{frame_list_one_second[frame_idx]}.jpg'
            keypoints1, keypoints2 = LoFTR_Detect_process(img1_path,img2_path,LOFTR)
            result_keypoints1, result_keypoints2 = delete_unplane_datapoints(result, idx_to_class_dict, keypoints1, keypoints2)
            is_moved = detect_movement(result_keypoints1, result_keypoints2, min_keypoint_count_th)
            
            if is_moved:
                if len(frame_list) > frame_continue_time_thre:
                    result_frame_list.append(frame_list)
                break
            
            frame_list.append(frame_list_one_second[frame_idx])
            frame_idx += 1
    
    frame_json = dict()
    frame_json['frame_list'] = result_frame_list
    json_file = os.path.join(cfg.DATA_FOLDER, cfg.AD_UNITS_CREATION_EXTRACTION.AD_UNITS_JSONS, cfg.AD_UNITS_CREATION_EXTRACTION.FREEZE_FRAME_JSON_FOR_DEBUG)
    dumpJson(json_file, frame_json)
    
    frame_json_key_frame = dict()
    frame_json_key_frame['frame_list'] = list()
    for i in range(len(result_frame_list)):
        frame_json_key_frame['frame_list'].append(result_frame_list[i][len(result_frame_list[i])//2])
    json_file = os.path.join(cfg.DATA_FOLDER, cfg.AD_UNITS_CREATION_EXTRACTION.AD_UNITS_JSONS, cfg.AD_UNITS_CREATION_EXTRACTION.FREEZE_FRAME_JSON)
    dumpJson(json_file, frame_json_key_frame)
        
    


if __name__ == '__main__':
    logging_format = "%(asctime)-15s %(levelname)s [%(pathname)s:%(lineno)d] p[%(process)s]  %(message)s"
    logging.basicConfig(format=logging_format, level=logging.INFO)
    logging.info("start freeze_frame_detect ad units")
    args = parse_args()
    proceed_freeze_frame_detect(args)
    logging.info("finish freeze_frame_detect ad units")
    #load video and extract all video frames, manage them using shot seperation.