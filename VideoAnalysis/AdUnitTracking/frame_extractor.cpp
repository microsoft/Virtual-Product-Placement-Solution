#include "frame_extractor.h"

#include "utils.h"  // brings in OpenCV, json, and namespace fs = std::experimental::filesystem

#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#include <cstdio>
#include <cstdlib>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <algorithm>
#include <unordered_map>
#include <mutex>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/statvfs.h>
#endif

namespace vad {

// Global constants definitions
const std::string busy_suffix = "busy";
const std::string frame_suffix = "png";
const std::string default_tmp_frame_prefix = "tmp";

// Cache for disk-based limits and adjusted batch sizes
static std::unordered_map<std::string, int> disk_cache_limit_map;
static std::unordered_map<std::string, int> adjusted_half_batch_size_map;

// Cache for video metadata (fps and frame count)
struct VideoMetadata {
    double fps;
    int total_frames;
};
static std::unordered_map<std::string, VideoMetadata> video_metadata_cache;
static std::mutex cache_mutex;

static inline std::string path_join(const std::string& a, const std::string& b) {
    if (a.empty()) return b;
    if (b.empty()) return a;
    if (a.back() == '/' || a.back() == '\\') return a + b;
    return a + "/" + b;
}

static inline std::string frames_dir_path(const std::string& data_folder, const std::string& frames_folder) {
    return path_join(data_folder, frames_folder);
}

static inline std::string frame_path_at(const std::string& data_folder,
                                        const std::string& frames_folder,
                                        int frame_id,
                                        const std::string& suffix) {
    std::ostringstream oss;
    oss << frame_id << "." << suffix;
    return path_join(frames_dir_path(data_folder, frames_folder), oss.str());
}

static inline bool file_exists_and_nonempty(const std::string& p) {
    FILE* f = std::fopen(p.c_str(), "rb");
    if (!f) return false;
    if (std::fseek(f, 0, SEEK_END) != 0) { std::fclose(f); return false; }
    long sz = std::ftell(f);
    std::fclose(f);
    return sz > 0;
}

static inline std::string get_busy_file_path(const std::string& data_folder,
                                            const std::string& frames_folder,
                                            int frame_id,
                                            const std::string& busy_suffix) {
    const std::string frame_path = frame_path_at(data_folder, frames_folder, frame_id, busy_suffix);
    return frame_path;
}

static bool ensure_dir_exists(const std::string& dir) {
    try {
        if (!fs::exists(dir)) {
            return fs::create_directories(dir);
        }
        return true;
    } catch (...) {
        return false;
    }
}

static int64_t get_disk_size(const std::string& data_folder) {
    /**
     * Get the total disk size in bytes for the given data folder.
     * Returns total disk size in bytes.
     */
    try {
        std::string path_to_check = data_folder;
        
        // If data_folder doesn't exist, find the nearest existing parent directory
        while (!path_to_check.empty() && !fs::exists(path_to_check)) {
            fs::path p(path_to_check);
            if (p.has_parent_path()) {
                path_to_check = p.parent_path().string();
            } else {
                path_to_check = "."; // Fallback to current directory
                break;
            }
        }
        
        if (path_to_check.empty()) {
            path_to_check = ".";
        }

#ifdef _WIN32
        ULARGE_INTEGER freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes;
        if (GetDiskFreeSpaceExA(path_to_check.c_str(), &freeBytesAvailable, &totalNumberOfBytes, &totalNumberOfFreeBytes)) {
            return static_cast<int64_t>(totalNumberOfBytes.QuadPart);
        }
#else
        struct statvfs stat;
        if (statvfs(path_to_check.c_str(), &stat) == 0) {
            return static_cast<int64_t>(stat.f_blocks) * static_cast<int64_t>(stat.f_frsize);
        }
#endif
    } catch (...) {
        std::cerr << "[frame_extractor] Failed to get disk size for " << data_folder << std::endl;
    }
    
    // Return a default large value if disk size cannot be determined
    return 2LL * 1024 * 1024 * 1024; // 2GB default
}

static int calculate_disk_based_limit(const std::string& data_folder) {
    /**
     * Calculate the maximum number of PNG files that can be stored based on disk space.
     * Uses 80% of disk space and assumes 10MB per PNG file.
     * Returns maximum number of PNG files that can be stored.
     */
    std::cout << "[frame_extractor] Calculating disk-based cache limit for " << data_folder << std::endl;
    auto it = disk_cache_limit_map.find(data_folder);
    if (it != disk_cache_limit_map.end()) {
        return it->second;
    }
    
    const int64_t disk_size = get_disk_size(data_folder);
    const int png_size_mb = 10; // Assume each PNG takes 10MB
    const double usable_space_ratio = 0.8; // Use 80% of disk space

    // Calculate max PNGs: (disk_size * 0.8) / (10MB)
    const int64_t usable_space_bytes = static_cast<int64_t>(disk_size * usable_space_ratio);
    const int64_t png_size_bytes = png_size_mb * 1024 * 1024; // Convert MB to bytes
    const int max_pngs = static_cast<int>(usable_space_bytes / png_size_bytes);
    
    // Cache the result since disk size is fixed when program starts
    disk_cache_limit_map[data_folder] = max_pngs;
    
    std::cout << "[frame_extractor] Calculated disk-based cache limit for " << data_folder
              << ": " << max_pngs << " PNGs (disk_size=" << (disk_size / 1024.0 / 1024.0 / 1024.0)
              << "GB, usable=" << (usable_space_bytes / 1024.0 / 1024.0 / 1024.0) << "GB)" << std::endl;
    
    return max_pngs;
}

static int adjust_half_batch_size(const std::string& data_folder, int original_half_batch_size) {
    /**
     * Adjust half_batch_size based on disk space limitations.
     * If disk space is limited, reduce half_batch_size to fit within disk constraints.
     * Returns adjusted half_batch_size value.
     */
    std::lock_guard<std::mutex> lock(cache_mutex);
    
    auto it = adjusted_half_batch_size_map.find(data_folder);
    if (it != adjusted_half_batch_size_map.end()) {
        return it->second;
    }
    
    // Calculate disk-based limit
    const int disk_based_limit = calculate_disk_based_limit(data_folder);
    
    // Original cache limit based on half_batch_size
    const int original_cache_limit = 4 * original_half_batch_size;
    
    int adjusted_half_batch_size;
    
    // If disk can accommodate the original cache limit, keep original half_batch_size
    if (disk_based_limit >= original_cache_limit) {
        adjusted_half_batch_size = original_half_batch_size;
        std::cout << "[frame_extractor] Disk space sufficient. Keeping original half_batch_size: "
                  << adjusted_half_batch_size << std::endl;
    } else {
        // Adjust half_batch_size: new_half_batch_size = disk_based_limit / 4
        adjusted_half_batch_size = std::max(1, disk_based_limit / 4); // Ensure at least 1
        std::cerr << "[frame_extractor] Disk space limited. Adjusting half_batch_size from "
                  << original_half_batch_size << " to " << adjusted_half_batch_size
                  << " (disk_based_limit=" << disk_based_limit << ", original_cache_limit="
                  << original_cache_limit << ")" << std::endl;
    }
    
    // Cache the adjusted value
    adjusted_half_batch_size_map[data_folder] = adjusted_half_batch_size;
    
    return adjusted_half_batch_size;
}

static int get_cache_limit(const std::string& data_folder, int half_batch_size) {
    /**
     * Get the cache limit considering both batch size and disk space constraints.
     * Returns maximum cached files allowed.
     */
    // Get adjusted half_batch_size based on disk space
    const int adjusted_half_batch_size = adjust_half_batch_size(data_folder, half_batch_size);
    
    // Calculate cache limit using adjusted half_batch_size
    const int cache_limit = 4 * adjusted_half_batch_size;
    
    std::cout << "[frame_extractor] Cache limit for " << data_folder << ": " << cache_limit
              << " (adjusted_half_batch_size=" << adjusted_half_batch_size << ")" << std::endl;
    
    return cache_limit;
}

static inline bool acquire_frame_lock(const std::string& data_folder,
                                     const std::string& frames_folder,
                                     int frame_id,
                                     const std::string& busy_suffix) {
    const std::string busy_path = get_busy_file_path(data_folder, frames_folder, frame_id, busy_suffix);

    try {
        // Create the directory if it doesn't exist
        const std::string dir = frames_dir_path(data_folder, frames_folder);
        ensure_dir_exists(dir);
        
        // Create or touch the busy file
        FILE* f = std::fopen(busy_path.c_str(), "a");
        if (f) {
            std::fclose(f);
            return true;
        }
    } catch (...) {
        // Handle any exceptions
    }
    return false;
}

static inline bool is_frame_locked(const std::string& data_folder,
                                  const std::string& frames_folder,
                                  int frame_id,
                                  const std::string& busy_suffix) {
    const std::string busy_path = get_busy_file_path(data_folder, frames_folder, frame_id, busy_suffix);
    return fs::exists(busy_path);
}

static inline bool release_frame_lock(const std::string& data_folder,
                                     const std::string& frames_folder,
                                     int frame_id,
                                     const std::string& busy_suffix) {
    const std::string busy_path = get_busy_file_path(data_folder, frames_folder, frame_id, busy_suffix);

    try {
        if (fs::exists(busy_path)) {
            return fs::remove(busy_path);
        }
    } catch (...) {
        // Handle any exceptions
    }
    return false;
}

static inline int extract_frame_id_from_path(const std::string& file_path) {
    /**
     * Extract frame ID from cache file path.
     * Frame files are named like "12345.png", extract the number part.
     */
    try {
        fs::path p(file_path);
        std::string filename = p.stem().string(); // filename without extension
        return std::stoi(filename);
    } catch (...) {
        return -1; // Invalid frame ID
    }
}

static inline void cleanup_old_cache_files_with_limit(const std::string& data_folder,
                                                      const std::string& frames_folder,
                                                      const std::string& frame_suffix,
                                                      const std::string& busy_suffix,
                                                      int cache_limit) {
    /**
     * Remove oldest cache files to maintain cache size limit, respecting frame locks.
     */
    try {
        const std::string frames_dir = frames_dir_path(data_folder, frames_folder);
        if (!fs::exists(frames_dir)) {
            return;
        }

        // Get all cached frame files
        std::vector<std::pair<std::string, std::time_t>> cached_files_with_time;
        
        for (const auto& entry : fs::directory_iterator(frames_dir)) {
            if (fs::is_regular_file(entry) && entry.path().extension() == ("." + frame_suffix)) {
                try {
                    auto ftime = fs::last_write_time(entry);
                    auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
                        ftime - fs::file_time_type::clock::now() + std::chrono::system_clock::now());
                    std::time_t cftime = std::chrono::system_clock::to_time_t(sctp);
                    cached_files_with_time.emplace_back(entry.path().string(), cftime);
                } catch (...) {
                    continue;
                }
            }
        }

        if (cached_files_with_time.size() <= static_cast<size_t>(cache_limit)) {
            return;
        }

        // Sort by access time (oldest first)
        std::sort(cached_files_with_time.begin(), cached_files_with_time.end(),
                  [](const std::pair<std::string, std::time_t>& a, const std::pair<std::string, std::time_t>& b) { return a.second < b.second; });

        // Remove oldest files, but skip locked files
        const size_t files_to_remove = cached_files_with_time.size() - cache_limit;
        size_t removed_count = 0;

        for (const auto& file_time_pair : cached_files_with_time) {
            if (removed_count >= files_to_remove) {
                break;
            }

            const std::string& file_path = file_time_pair.first;
            
            // Extract frame_id from file path to check if it's locked
            const int frame_id = extract_frame_id_from_path(file_path);
            if (frame_id >= 0 && is_frame_locked(data_folder, frames_folder, frame_id, busy_suffix)) {
                std::cout << "[frame_extractor] Skipping locked cache file: \"" << fs::path(file_path).filename() << "\"" << std::endl;
                continue;
            }

            try {
                if (fs::remove(file_path)) {
                    std::cout << "[frame_extractor] Proactively removed old cache file: \"" << fs::path(file_path).filename() << "\"" << std::endl;
                    ++removed_count;
                }
            } catch (...) {
                std::cerr << "[frame_extractor] Failed to remove cache file: " << file_path << std::endl;
            }
        }
    } catch (...) {
        std::cerr << "[frame_extractor] Error during cache cleanup" << std::endl;
    }
}

static inline void cleanup_old_cache_files(const std::string& data_folder,
                                           const std::string& frames_folder,
                                           const std::string& frame_suffix,
                                           const std::string& busy_suffix,
                                           int half_batch_size) {
    /**
     * Remove oldest cache files using disk-space-aware cache limit.
     */
    const int cache_limit = get_cache_limit(data_folder, half_batch_size);
    cleanup_old_cache_files_with_limit(data_folder, frames_folder, frame_suffix, busy_suffix, cache_limit);
}

static inline void cleanup_old_cache_files_before_extraction(const std::string& data_folder,
                                                             const std::string& frames_folder,
                                                             const std::string& frame_suffix,
                                                             const std::string& busy_suffix,
                                                             int half_batch_size,
                                                             int new_files_count) {
    /**
     * Remove oldest cache files proactively before extraction to ensure space for new files.
     */
    try {
        const std::string frames_dir = frames_dir_path(data_folder, frames_folder);
        if (!fs::exists(frames_dir)) {
            return;
        }

        // Get all cached frame files
        std::vector<std::pair<std::string, std::time_t>> cached_files_with_time;
        
        for (const auto& entry : fs::directory_iterator(frames_dir)) {
            if (fs::is_regular_file(entry) && entry.path().extension() == ("." + frame_suffix)) {
                try {
                    auto ftime = fs::last_write_time(entry);
                    auto sctp = std::chrono::time_point_cast<std::chrono::system_clock::duration>(
                        ftime - fs::file_time_type::clock::now() + std::chrono::system_clock::now());
                    std::time_t cftime = std::chrono::system_clock::to_time_t(sctp);
                    cached_files_with_time.emplace_back(entry.path().string(), cftime);
                } catch (...) {
                    continue;
                }
            }
        }

        const int cache_limit = get_cache_limit(data_folder, half_batch_size);
        const int current_count = static_cast<int>(cached_files_with_time.size());
        
        // Calculate how many files we need to remove to make space for new files
        const int total_after_extraction = current_count + new_files_count;
        const int files_to_remove = std::max(0, total_after_extraction - cache_limit);
        
        if (files_to_remove <= 0) {
            std::cout << "[frame_extractor] No cleanup needed. Current: " << current_count
                      << ", Adding: " << new_files_count << ", Limit: " << cache_limit << std::endl;
            return;
        }

        std::cout << "[frame_extractor] Proactive cleanup: removing " << files_to_remove
                  << " files to make space for " << new_files_count << " new files "
                  << "(current: " << current_count << ", limit: " << cache_limit << ")" << std::endl;

        // Sort by access time (oldest first)
        std::sort(cached_files_with_time.begin(), cached_files_with_time.end(),
                  [](const std::pair<std::string, std::time_t>& a, const std::pair<std::string, std::time_t>& b) {
                      return a.second < b.second;
                  });

        // Remove oldest files, but skip locked files
        int removed_count = 0;
        for (const auto& file_time_pair : cached_files_with_time) {
            if (removed_count >= files_to_remove) {
                break;
            }

            const std::string& file_path = file_time_pair.first;
            
            // Extract frame_id from file path to check if it's locked
            const int frame_id = extract_frame_id_from_path(file_path);
            if (frame_id >= 0 && is_frame_locked(data_folder, frames_folder, frame_id, busy_suffix)) {
                std::cout << "[frame_extractor] Skipping locked cache file: \"" << fs::path(file_path).filename() << "\"" << std::endl;
                continue;
            }

            try {
                if (fs::remove(file_path)) {
                    std::cout << "[frame_extractor] Proactively removed old cache file: \"" << fs::path(file_path).filename() << "\"" << std::endl;
                    ++removed_count;
                }
            } catch (...) {
                std::cerr << "[frame_extractor] Failed to remove cache file: " << file_path << std::endl;
            }
        }
    } catch (...) {
        std::cerr << "[frame_extractor] Error during proactive cache cleanup" << std::endl;
    }
}

static inline void cleanup_orphaned_busy_files(const std::string& data_folder,
                                               const std::string& frames_folder,
                                               const std::string& busy_suffix,
                                               const std::string& frame_suffix) {
    /**
     * Remove .busy files that don't have corresponding frame files.
     */
    try {
        const std::string frames_dir = frames_dir_path(data_folder, frames_folder);
        if (!fs::exists(frames_dir)) {
            return;
        }

        // Find all .busy files
        for (const auto& entry : fs::directory_iterator(frames_dir)) {
            if (fs::is_regular_file(entry) && entry.path().extension() == ("." + busy_suffix)) {
                // Get corresponding frame file path
                std::string frame_file = entry.path().string();
                const size_t suffix_len = busy_suffix.length() + 1; // +1 for the dot
                frame_file = frame_file.substr(0, frame_file.length() - suffix_len) + "." + frame_suffix; // Remove .busy suffix

                // If frame file doesn't exist, remove the orphaned busy file
                if (!fs::exists(frame_file)) {
                    try {
                        fs::remove(entry.path());
                        std::cout << "[frame_extractor] Removed orphaned busy file: " << entry.path().filename() << std::endl;
                    } catch (...) {
                        std::cerr << "[frame_extractor] Failed to remove orphaned busy file: " << entry.path() << std::endl;
                    }
                }
            }
        }
    } catch (...) {
        std::cerr << "[frame_extractor] Error during orphaned busy files cleanup" << std::endl;
    }
}


static bool get_video_fps_and_count(const std::string& video_path, double& fps, int& total_frames) {
    std::lock_guard<std::mutex> lock(cache_mutex);
    
    // Check if metadata is already cached
    auto it = video_metadata_cache.find(video_path);
    if (it != video_metadata_cache.end()) {
        fps = it->second.fps;
        total_frames = it->second.total_frames;
        return true;
    }
    
    // Not cached, compute the metadata
    cv::VideoCapture cap(video_path);
    if (!cap.isOpened()) {
        std::cerr << "[frame_extractor] Failed to open video: " << video_path << std::endl;
        return false;
    }
    fps = cap.get(cv::CAP_PROP_FPS);
    total_frames = static_cast<int>(cap.get(cv::CAP_PROP_FRAME_COUNT));
    cap.release();

    if (!(fps > 0.0) || fps > 1000.0) {
        fps = 30.0; // fallback
    }
    if (total_frames <= 0) {
        total_frames = -1; // unknown
    }
    
    // Cache the computed metadata
    video_metadata_cache[video_path] = {fps, total_frames};
    
    std::cout << "[frame_extractor] Cached video metadata for " << video_path
              << ": fps=" << fps << ", total_frames=" << total_frames << std::endl;
    
    return true;
}

static std::string build_ffmpeg_cmd(const std::string& video_path,
                                    const std::string& output_pattern,
                                    bool use_ts_processing,
                                    int frames_limit,
                                    const std::string& input_seek_sec,  // may be empty
                                    const std::string& output_seek_sec  // may be empty
                                    )
{
    const std::string ffmpeg_loglevel = "-hide_banner -loglevel warning";
    const std::string other_parameter = "-start_number 0 -vsync 0";
    const std::string frames_limit_part = (frames_limit > 0) ? ("-frames:v " + std::to_string(frames_limit)) : "";
    const std::string input_seek = (!input_seek_sec.empty()) ? ("-ss " + input_seek_sec) : "";
    const std::string output_seek = (!output_seek_sec.empty()) ? ("-ss " + output_seek_sec) : "";

    std::ostringstream oss;
    if (use_ts_processing) {
        // HDR/TS-style conversion similar to Python path
        oss << "ffmpeg " << ffmpeg_loglevel << " "
            << input_seek << " -i \"" << video_path << "\" "
            << output_seek << " "
            << "-vf \"zscale=t=linear:npl=400, zscale=t=bt709:m=bt709:r=tv\" "
            << "-pix_fmt rgb24 -color_primaries bt709 -color_trc iec61966-2-1 -colorspace bt709 "
            << other_parameter << " " << frames_limit_part << " -y "
            << "\"" << output_pattern << "\"";
    } else {
        // Standard MP4 extraction
        oss << "ffmpeg " << ffmpeg_loglevel << " "
            << input_seek << " -i \"" << video_path << "\" "
            << output_seek << " -q:v 2 "
            << other_parameter << " " << frames_limit_part << " -y "
            << "\"" << output_pattern << "\"";
    }
    return oss.str();
}

std::string get_target_frame_path_direct_optimized(
    const std::string& video_path,
    const std::string& data_folder,
    const std::string& frames_folder,
    int frame_id,
    const std::string& frame_suffix,
    bool use_ts_processing,
    int half_batch_size,
    double previous_interval,
    const std::string& prefix,
    const std::string& busy_suffix)
{
    if (video_path.empty() || !fs::exists(video_path)) {
        std::cerr << "[frame_extractor] Invalid video path: " << video_path << std::endl;
        return "";
    }

    // OPTIMISTIC LOCKING: First check if file exists, then acquire lock and verify
    // This reduces I/O by only creating lock files when the frame is actually cached
    const std::string target_path = frame_path_at(data_folder, frames_folder, frame_id, frame_suffix);
    
    // Ensure frames dir exists first (needed for lock file creation)
    const std::string out_dir = frames_dir_path(data_folder, frames_folder);
    if (!ensure_dir_exists(out_dir)) {
        std::cerr << "[frame_extractor] Failed to create frames directory: " << out_dir << std::endl;
        return "";
    }
    
    // Optimistic check: if file exists, acquire lock and verify it still exists
    if (file_exists_and_nonempty(target_path)) {
        if (acquire_frame_lock(data_folder, frames_folder, frame_id, busy_suffix)) {
            // Double-check file still exists after acquiring lock (prevents race condition)
            if (file_exists_and_nonempty(target_path)) {
                return target_path;
            }
            // File was deleted between check and lock acquisition, release lock and continue to extract
            release_frame_lock(data_folder, frames_folder, frame_id, busy_suffix);
        } else {
            std::cerr << "[frame_extractor] Failed to acquire lock for frame: " << frame_id << std::endl;
        }
    }
    
    // File doesn't exist, proceed to extract (no lock needed during extraction)

    // Determine fps and total frames
    double fps = 30.0;
    int total_frames = -1;
    get_video_fps_and_count(video_path, fps, total_frames);

    // Adjust half_batch_size based on disk space constraints
    const int adjusted_half_batch_size = adjust_half_batch_size(data_folder, half_batch_size);
    
    // Choose batch window using adjusted half_batch_size
    const int half = std::max(1, adjusted_half_batch_size);
    int start_idx = std::max(0, frame_id - half);
    int end_idx = (total_frames > 0) ? std::min(total_frames, frame_id + half) : (frame_id + half);

    // Trim already-cached edges
    while (start_idx < end_idx) {
        const std::string p = frame_path_at(data_folder, frames_folder, start_idx, frame_suffix);
        if (!file_exists_and_nonempty(p)) break;
        ++start_idx;
    }
    while (end_idx > start_idx) {
        const std::string p2 = frame_path_at(data_folder, frames_folder, end_idx - 1, frame_suffix);
        if (!file_exists_and_nonempty(p2)) break;
        --end_idx;
    }

    if (start_idx >= end_idx) {
        // No new frames to extract, but target might exist now (extracted by another process)
        if (file_exists_and_nonempty(target_path)) {
            acquire_frame_lock(data_folder, frames_folder, frame_id, busy_suffix);
            // Double-check file still exists after acquiring lock
            if (file_exists_and_nonempty(target_path)) {
                return target_path;
            }
            release_frame_lock(data_folder, frames_folder, frame_id, busy_suffix);
        }
        return "";
    }

    const int frames_limit = end_idx - start_idx;

    // Compute seek times
    const double seek_time = static_cast<double>(start_idx) / std::max(1e-6, fps);
    std::string coarse_seek_str, fine_seek_str;
    if (seek_time > previous_interval) {
        const double coarse_seek = std::max(0.0, seek_time - previous_interval);
        const double fine_seek = seek_time - coarse_seek;
        std::ostringstream a, b;
        a << std::fixed << std::setprecision(6) << coarse_seek;
        b << std::fixed << std::setprecision(6) << fine_seek;
        coarse_seek_str = a.str();
        fine_seek_str = b.str();
    } else {
        std::ostringstream b;
        b << std::fixed << std::setprecision(6) << seek_time;
        coarse_seek_str.clear();
        fine_seek_str = b.str();
    }

    // Cleanup old cache files BEFORE extraction to ensure we have enough space
    // We know we'll create frames_limit new files, so clean up proactively
    cleanup_old_cache_files_before_extraction(data_folder, frames_folder, frame_suffix, busy_suffix, adjusted_half_batch_size, frames_limit);
    
    // Cleanup orphaned busy files (busy files without corresponding frame files)
    cleanup_orphaned_busy_files(data_folder, frames_folder, busy_suffix, frame_suffix);

    // Output pattern: prefix_%d.suffix (no zero-padding)
    const std::string output_pattern = path_join(out_dir, prefix + "_%d." + frame_suffix);
    const std::string cmd = build_ffmpeg_cmd(video_path, output_pattern, use_ts_processing, frames_limit, coarse_seek_str, fine_seek_str);

    // Execute ffmpeg
    int ret = std::system(cmd.c_str());
    if (ret != 0) {
        std::cerr << "[frame_extractor] ffmpeg extraction failed, code: " << ret << std::endl;
        return "";
    }

    // Rename tmp_{idx}.suffix -> {frame_id}.suffix to keep as cache
    for (int i = 0; i < frames_limit; ++i) {
        const int fid = start_idx + i;
        const std::string tmp_file = path_join(out_dir, prefix + "_" + std::to_string(i) + "." + frame_suffix);
        const std::string dst_file = frame_path_at(data_folder, frames_folder, fid, frame_suffix);

        if (!file_exists_and_nonempty(tmp_file)) {
            // If ffmpeg wrote zero-padded names, try tmp_000, tmp_001...
            std::ostringstream alt;
            alt << prefix << "_" << std::setw(3) << std::setfill('0') << i << "." << frame_suffix;
            const std::string tmp_file_alt = path_join(out_dir, alt.str());
            if (file_exists_and_nonempty(tmp_file_alt)) {
                std::remove(dst_file.c_str()); // ensure overwrite
                std::rename(tmp_file_alt.c_str(), dst_file.c_str());
            }
            continue;
        }

        std::remove(dst_file.c_str()); // ensure overwrite
        if (std::rename(tmp_file.c_str(), dst_file.c_str()) != 0) {
            // If rename fails, try copy-then-remove
            cv::Mat img = cv::imread(tmp_file, cv::IMREAD_UNCHANGED);
            if (!img.empty()) {
                cv::imwrite(dst_file, img);
                std::remove(tmp_file.c_str());
            }
        }
    }


    // Return target frame if now available, and acquire lock with double-check
    if (file_exists_and_nonempty(target_path)) {
        acquire_frame_lock(data_folder, frames_folder, frame_id, busy_suffix);
        // Double-check file still exists after acquiring lock
        if (file_exists_and_nonempty(target_path)) {
            return target_path;
        }
        release_frame_lock(data_folder, frames_folder, frame_id, busy_suffix);
    }
    return "";
}

bool release_frame_lock_cpp(const std::string& data_folder,
                            const std::string& frames_folder,
                            int frame_id,
                            const std::string& busy_suffix) {
    /**
     * Release a lock on a cached frame to allow it to be deleted during cleanup.
     *
     * Call this function when you no longer need a frame that was returned by
     * get_target_frame_path_direct_optimized() to allow the cache cleanup process
     * to delete it if needed.
     *
     * Args:
     *     data_folder: Base data folder path
     *     frames_folder: Frames subfolder name
     *     frame_id: Frame ID to unlock
     *     suffix: File extension (e.g., "png")
     *
     * Returns:
     *     bool: True if lock was successfully released, false otherwise
     *
     * Example:
     *     // Get frame A
     *     std::string frame_a_path = get_target_frame_path_direct_optimized(video, data_folder, frames_folder, 100, "png", false, 200, 10.0, "tmp");
     *
     *     // Get frame B
     *     std::string frame_b_path = get_target_frame_path_direct_optimized(video, data_folder, frames_folder, 500, "png", false, 200, 10.0, "tmp");
     *
     *     // Do comparison between A and B
     *     compare_frames(frame_a_path, frame_b_path);
     *
     *     // Release locks when done
     *     release_frame_lock_cpp(data_folder, frames_folder, 100, "png");
     *     release_frame_lock_cpp(data_folder, frames_folder, 500, "png");
     */
    return release_frame_lock(data_folder, frames_folder, frame_id, busy_suffix);
}

void cleanup_cache_files_cpp(const std::string& data_folder,
                            const std::string& frames_folder,
                            const std::string& frame_suffix,
                            const std::string& busy_suffix,
                            int cache_limit) {
    /**
     * Manually trigger cache cleanup to remove oldest cached frames.
     *
     * This function removes the oldest cached frames while respecting .busy file locks.
     * Frames with corresponding .busy files are skipped even if they're the oldest.
     *
     * Args:
     *     data_folder: Base data folder path
     *     frames_folder: Frames subfolder name
     *     suffix: File extension for cached frames (e.g., "png")
     *     cache_limit: Maximum number of frames to keep
     */
    cleanup_old_cache_files_with_limit(data_folder, frames_folder, frame_suffix, busy_suffix, cache_limit);
}

void cleanup_orphaned_busy_files_cpp(const std::string& data_folder,
                                     const std::string& frames_folder,
                                     const std::string& busy_suffix,
                                     const std::string& frame_suffix) {
    /**
     * Clean up orphaned .busy files that don't have corresponding frame files.
     *
     * This function removes .busy files that exist without corresponding frame files,
     * which can happen if frame files are deleted externally or due to errors.
     *
     * Args:
     *     data_folder: Base data folder path
     *     frames_folder: Frames subfolder name
     */
    cleanup_orphaned_busy_files(data_folder, frames_folder, busy_suffix, frame_suffix);
}

int get_cache_limit_cpp(const std::string& data_folder, int half_batch_size) {
    /**
     * Calculate disk-space-aware cache limit for a given data folder and half_batch_size.
     *
     * This considers both the default cache limit (4 * half_batch_size) and available disk space.
     * Uses 80% of available disk space with 4MB per PNG assumption.
     *
     * Args:
     *     data_folder: Base data folder path
     *     half_batch_size: Original half batch size
     *
     * Returns:
     *     int: Calculated cache limit considering disk space constraints
     */
    return get_cache_limit(data_folder, half_batch_size);
}

int adjust_half_batch_size_cpp(const std::string& data_folder, int original_half_batch_size) {
    /**
     * Adjust half_batch_size based on disk space limitations.
     *
     * If disk space is limited, reduces half_batch_size to fit within disk constraints.
     * This should be called when first using a data_folder to optimize for available space.
     *
     * Args:
     *     data_folder: Base data folder path
     *     original_half_batch_size: Original half batch size
     *
     * Returns:
     *     int: Adjusted half batch size that fits within disk constraints
     */
    return adjust_half_batch_size(data_folder, original_half_batch_size);
}

} // namespace vad