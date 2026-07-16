This project is dedicated to perform ad unit tracking.

Tested under `opencv-4.1.0` and `visp-3.2.0`

# install dependencies

## install opencv from source

- download [opencv-4.1.0](https://github.com/opencv/opencv/releases) and [opencv_contrib-4.1.0](https://github.com/opencv/opencv_contrib/releases)
- unzip tarball, e.g., ```tar zxvf opencv*.tar.gz```
- cd opencv folder and ```mkdir build``` and ```cd build```
- generate Makefile, e.g,
  ```cmake -DCMAKE_BUILD_TYPE=RELEASE -DENABLE_FAST_MATH=ON -DWITH_FFMPEG=ON -DWITH_CUDA=ON -DBUILD_opencv_cudacodec=OFF -DOPENCV_ENABLE_NONFREE=ON -DBUILD_EXAMPLES=OFF -DBUILD_PERF_TESTS=OFF -DBUILD_TESTS=OFF -DBUILD_opencv_python3=ON -DPYTHON_EXECUTABLE=/usr/bin/python3.6 -DOPENCV_EXTRA_MODULES_PATH=/home/xiax/workspace/opencv_contrib-4.1.0/modules ..``` (small modification might be needed)
- ```make -j8``` and ```sudo make install```

The official opencv [install tutorial](https://docs.opencv.org/4.1.0/d7/d9f/tutorial_linux_install.html) for reference.

## install visp from source

- download [visp-3.2.0](http://gforge.inria.fr/frs/download.php/latestfile/475/visp-3.2.0.tar.gz)
- unzip tarball
- cd visp folder and ```mkdir build``` and ```cd build```
- generate Makefile, e.g, ```cmake ..```
- ```make -j8``` and no need for intall

The official visp [intall tutorial](https://visp-doc.inria.fr/doxygen/visp-3.2.0/tutorial-install-ubuntu.html) for reference.

# build

## build runable target

- ```mkdir build``` and ```cd build```
- ```cmake ..``` and ```make```

Small modification might be needed for `CMakeLists.txt`. It will generate two runable target ```track``` and ```track-test```.

```./cmd -h``` for cmd params description, e.g., ```./track -h``` shows:
```
Usage : ./track [options]
Available options:
Usage: track [params] cfg_file data_folder instance_id tl_x tl_y tr_x tr_y br_x br_y bl_x bl_y

        -h, --help (value:true)
                print help info

        cfg_file
                input config file
        data_folder
                input data folder
        instance_id
                input instance id to track
        tl_x
                top left point of an ad unit
        tl_y
                top left point of an ad unit
        tr_x
                top right point of an ad unit
        tr_y
                top right point of an ad unit
        br_x
                bottom right point of an ad unit
        br_y
                bottom right point of an ad unit
        bl_x
                bottom left point of an ad unit
        bl_y
                bottom left point of an ad unit
```

# configuration file

| key | description |
| ---- | ----- |
| DATA_FOLDER | input data folder. |
| OUTPUT_FOLDER | output data folder. |
| DEBUG | debug flag. When it deployed to online portal, this flag should be set to false. If it is true, it requires display GUI, and will output some debug info. |
| FRAMES_FOLDER | frames folder. Default is "frames". |
| FRAME_MAX_LONG | frame's maximal longer border. Default is 1280. It is used to accelarate the processing. |
| FRAME_MAX_SHORT | frame's maximal shorter border. Default is 720. It is used to accelarate the processing. |
| INPUT_PARAMS.PARAMS_JSON | pipeline input params json, which is stored in DATA_FOLDER |
| INPUT_PARAMS.OPTIONS_KEY | key name of options in pipeline input params. The options' value includes customized params to detect or track, with similar structure in default.json |
| VIDEO_META.META_JSON | video's meta info. FPS, raw frame height/width, etc. |
| AD_UNITS_EXTRACTION.AD_UNITS_JSONS | ad units related files folder. |
| AD_UNITS_EXTRACTION.SHOTS_JSON | video shots. |
| AD_UNITS_EXTRACTION.AD_UNITS_JSON | detected ad unit points json. |
| AD_UNITS_EXTRACTION.AD_UNITS_INSTANCES_JSON | detected ad unit instances json. |
| AD_UNITS_EXTRACTION.SAMPLEFRAME_AD_UNITS_JSON | (debug mode)detected ad unit instances json of the substage -- detection on sampled frames. |
| AD_UNITS_EXTRACTION.PRETRACKING_AD_UNITS_JSON | (debug mode)detected ad unit instances json of the substage -- pretracking. |
| AD_UNITS_EXTRACTION.RESULT_LEVEL | level of the ad units extraction results, choose from ['standard', 'analysis']. for standard(default), there are only valid ad units; for analysis there are also invalid ad units in the json files AD_UNITS_INSTANCES_JSON etc. |
| AD_UNITS_EXTRACTION.THRESHOLD_SBD | threshold for shot boundary detection. Larger value for fewer shots. Default is 0.3 |
| AD_UNITS_EXTRACTION.THRESHOLD_ANGLE | threshold for ad unit's inner angles. This is cosine value, and is used for guarantee the ad unit is close to a rectangle. |
| AD_UNITS_EXTRACTION.THRESHOLD_AREA_MIN | threshold for minimal ad unit area (percentage of `frame width * frame height`). |
| AD_UNITS_EXTRACTION.THRESHOLD_AREA_MAX | threshold for maximal ad unit area (percentage of `frame width * frame height`). |
| AD_UNITS_EXTRACTION.THRESHOLD_CLASSIFIER | threshold for bi-category classifier confidence. default 0.5 |
| AD_UNITS_EXTRACTION.THRESHOLD_SCORE | threshold for final score defined in cal_ranking_prob(). |
| THRESHOLD_FILTER_BY_CONTENT | filter ad unit by content if confidence > threshold. |
| AD_UNITS_EXTRACTION.OCTAVE | octave (number of multiscale) for auto ad unit detection. |
| AD_UNITS_EXTRACTION.THRESHOLD_EDGE_RATIO | minimal ratio for shorest ad unit edge over longest ad unit edge. |
| AD_UNITS_EXTRACTION.THRESHOLD_FLOW | maximal flow threshold for continuous frames. |
| AD_UNITS_EXTRACTION.THRESHOLD_NMS_IOU | non-maximal supression (NMS) intersection-over-union (IOU) threshold for merge similar ad units. |
| AD_UNITS_EXTRACTION.EPSILON | epsilon used in approximate ad unit contour. |
| AD_UNITS_EXTRACTION.THRESHOLD_LAST_TIMES | minimal number of continuously lasting times for each ad unit. (abandoned in version >= v4.6.2)|
| AD_UNITS_EXTRACTION.THRESHOLD_LAST_SECONDS | minimal number of continuously lasting seconds for each ad unit. |
| AD_UNITS_EXTRACTION.DETECT_TIME_INTERVAL | time interval(second) of frame sampling to do detection in each shot. |
| AD_UNITS_EXTRACTION.OCCLUSION_SEGMENTATION_MODEL | the name of segmentation model used in occlusion detection when MODEL_INFERENCE_TYPE=="local", choose from [mask_rcnn, yolact]. |
| AD_UNITS_EXTRACTION.VIDEO_PROCESSING_HEAD_TIME | the time(second) of head of video to do processing, default value is -1, means processing whole video. |
| AD_UNITS_TRACKING.MODIFIED_AD_UNITS_JSONS | modified ad units related files folder. |
| AD_UNITS_TRACKING.AD_UNITS_INSTANCES_JSON | modified ad unit instances json. |
| AD_UNITS_TRACKING.TRACKING_BACKWARD | backward tracking flag. Default is true. |
| AD_UNITS_TRACKING.THRESHOLD_NCC_GOOD | normalized cross correlation (NCC) score thershold. If the NCC between the tracked ad unit and reference ad unit (target) larger than this threshold, it could be treated as a high quality tracked ad unit. |
| AD_UNITS_TRACKING.THRESHOLD_NCC_FAIL | normalized cross correlation (NCC) score thershold for tracking failing. If the NCC between the tracked ad unit and reference ad unit (target) smaller than this threshold, it could be treated as tracking failed, and tracking will be terminated. Default is 0.8. |
| AD_UNITS_TRACKING.PYRAMIDAL_TRACKING | pyramidal tracking flag for visp ESM tracker. |
| AD_UNITS_TRACKING.ROOTSIFT | root sift feature flag for sift geometrical verification. |
| AD_UNITS_TRACKING.SIFTRATIO | sift ratio for sift feature matching. |
| AD_UNITS_TRACKING.REMOVEREPEAT | remove repeat matching flag in sift geometrical verification. |
| AD_UNITS_TRACKING.CMT_ESTIMATE_SCALE | scale estimation flag for Consensus-based Matching and Tracking (CMT) tracker. |
| AD_UNITS_TRACKING.CMT_ESTIMATE_ROTATION | rotation estimation flag for CMT tracker. |
| AD_UNITS_TRACKING.OCCLUSION_SEGMENTATION_MODEL | the name of segmentation model used in occlusion detection, choose from [mask_rcnn, yolact]. |
| AD_UNITS_TRACKING.SAM_FILTER_ENABLED | enable sam_filter during occlusion detection stage or not, choose from [true, false]. |
| AD_EMBEDDING.ADS_FOLDER | ads folder. |
| AD_EMBEDDING.ADS_JSON | ads meta info json. |
| AD_EMBEDDING.BORDERTYPE | border type for replicating ad image borders. 0 for ```cv.BORDER_CONSTANT``` (constant color value is white, i.e. (255, 255, 255)), 1 for ```cv.BORDER_REPLICATE```. Default is 1. |
| AD_EMBEDDING.EMBEDDING_ALPHA | blend alpha value (workaround for ad illumination). If 0 < alpha <= 1, it will use this value for inserting ad, otherwise it will be estimated from ad unit surroundings. |

If the results need further refinement, tuning on following parameters (including `AD_UNITS_EXTRACTION.THRESHOLD_SBD`, `AD_UNITS_EXTRACTION.THRESHOLD_LAST_TIMES`, `AD_UNITS_TRACKING.TRACKING_BACKWARD`, `AD_UNITS_TRACKING.THRESHOLD_NCC_GOOD`, `AD_UNITS_TRACKING.THRESHOLD_NCC_FAIL`, `AD_EMBEDDING.BORDERTYPE`. `AD_EMBEDDING.EMBEDDING_ALPHA`) might be helpful.

ad unit related json description could be found from [onenote](https://microsoft.sharepoint.com/teams/VideoAdsVirtualAds/_layouts/OneNote.aspx?id=%2Fteams%2FVideoAdsVirtualAds%2FShared%20Documents%2FGeneral%2FVideoAds%20%2B%20Virtual%20Ads&wd=target%28Tech%20Related.one%7C603A442C-6020-4200-92B8-38D77947736A%2FAd%20Unit%20Flow%7CA60707ED-7CD9-4486-80CB-18277EE2F694%2F%29
onenote:https://microsoft.sharepoint.com/teams/VideoAdsVirtualAds/Shared%20Documents/General/VideoAds%20+%20Virtual%20Ads/Tech%20Related.one#Ad%20Unit%20Flow&section-id={603A442C-6020-4200-92B8-38D77947736A}&page-id={A60707ED-7CD9-4486-80CB-18277EE2F694}&end)