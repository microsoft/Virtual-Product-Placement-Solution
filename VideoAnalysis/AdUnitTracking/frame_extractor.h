#ifndef FRAME_EXTRACTOR_H
#define FRAME_EXTRACTOR_H

#include <string>

namespace vad {

// Global constants for frame extraction (defined in frame_extractor.cpp)
extern const std::string busy_suffix;
extern const std::string frame_suffix; // Default frame file suffix
extern const std::string default_tmp_frame_prefix; // Default prefix for temporary frames

// Extract frames lazily to disk around target frame and return target frame path.
// - video_path: full path to the video file.
// - data_folder: base data folder.
// - frames_folder: subfolder under data_folder for frame images.
// - frame_id: target frame index (0-based).
// - suffix: file extension for saved frames (e.g., "png" or "jpg").
// - use_ts_processing: enable HDR/TS color conversion ffmpeg filters.
// - half_batch_size: number of frames taken to the left and right.
// - previous_interval: coarse seek step in seconds for hybrid seek.
// - prefix: temporary filename prefix for batch outputs.
//
// Returns absolute path to the target frame image if available/extracted, else empty string.
std::string get_target_frame_path_direct_optimized(
    const std::string& video_path,
    const std::string& data_folder,
    const std::string& frames_folder,
    int frame_id,
    const std::string& frame_suffix = frame_suffix,
    bool use_ts_processing = false,
    int half_batch_size = 100,
    double previous_interval = 5.0,
    const std::string& prefix = default_tmp_frame_prefix,
    const std::string& busy_suffix = busy_suffix);

// Release a lock on a cached frame to allow it to be deleted during cleanup.
// Call this when you no longer need a frame to allow cache cleanup.
// Returns true if lock was successfully released, false otherwise.
bool release_frame_lock_cpp(
    const std::string& data_folder,
    const std::string& frames_folder,
    int frame_id,
    const std::string& busy_suffix = busy_suffix);

// Manually trigger cache cleanup to remove oldest cached frames.
// This is called automatically during frame extraction but can be called manually.
// - data_folder: base data folder path
// - frames_folder: frames subfolder name
// - suffix: file extension for cached frames (e.g., "png")
// - cache_limit: maximum number of frames to keep (default: 800)
void cleanup_cache_files_cpp(
    const std::string& data_folder,
    const std::string& frames_folder,
    const std::string& suffix = frame_suffix,
    const std::string& busy_suffix = busy_suffix,
    int cache_limit = 800);

// Clean up orphaned .busy files that don't have corresponding frame files.
// This is called automatically during frame extraction but can be called manually.
void cleanup_orphaned_busy_files_cpp(
    const std::string& data_folder,
    const std::string& frames_folder,
    const std::string& busy_suffix = busy_suffix,
    const std::string& frame_suffix = frame_suffix);

// Calculate disk-space-aware cache limit for a given data folder and half_batch_size.
// This considers both the default cache limit (4 * half_batch_size) and available disk space.
// Uses 80% of available disk space with 4MB per PNG assumption.
int get_cache_limit_cpp(
    const std::string& data_folder,
    int half_batch_size = 100);

// Adjust half_batch_size based on disk space limitations.
// If disk space is limited, reduces half_batch_size to fit within disk constraints.
// This should be called when first using a data_folder to optimize for available space.
int adjust_half_batch_size_cpp(
    const std::string& data_folder,
    int original_half_batch_size = 100);

} // namespace vad

#endif // FRAME_EXTRACTOR_H