# Copyright (c) OpenMMLab. All rights reserved.
import sys
import os
import mmcv
import mmcv_custom   # noqa: F401,F403
import mmseg_custom   # noqa: F401,F403
from mmseg.apis import inference_segmentor, init_segmentor
from mmseg.core.evaluation import get_palette
from mmcv.runner import load_checkpoint
from mmseg.core import get_classes
import cv2
import os.path as osp

def initialize_model(config, checkpoint, palette):
    model = init_segmentor(config, checkpoint=None, device='cuda:0')
    checkpoint = load_checkpoint(model, checkpoint)
    palette = 'ade'
    if 'CLASSES' in checkpoint.get('meta', {}):
        model.CLASSES = checkpoint['meta']['CLASSES']
    else:
        model.CLASSES = get_classes(palette)
    return model

def predict(model,img):
    result = inference_segmentor(model, img)
    return result