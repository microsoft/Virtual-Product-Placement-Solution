#ifndef FRAME_PATH_RAII_H
#define FRAME_PATH_RAII_H

#include <string>
#include "frame_extractor.h"

namespace vad {

/**
 * RAII wrapper for frame paths that automatically releases frame locks when destructed.
 * This class manages the lifecycle of frame paths and ensures proper cleanup of frame locks.
 */
class FramePathRAII {
private:
    std::string path_;
    std::string data_folder_;
    std::string frames_folder_;
    int frame_id_;
    std::string busy_suffix_;
    bool should_release_;

public:
    /**
     * Constructor that takes the frame path and necessary parameters for release.
     * @param path The full path to the frame file
     * @param data_folder Base data folder path
     * @param frames_folder Frames subfolder name
     * @param frame_id Frame ID for lock release
     * @param busy_suffix Busy suffix for lock files (defaults to global busy_suffix)
     */
    FramePathRAII(const std::string& path, 
                  const std::string& data_folder,
                  const std::string& frames_folder,
                  int frame_id,
                  const std::string& busy_suffix = vad::busy_suffix)
        : path_(path)
        , data_folder_(data_folder)
        , frames_folder_(frames_folder)
        , frame_id_(frame_id)
        , busy_suffix_(busy_suffix)
        , should_release_(true) {
    }

    /**
     * Copy constructor - transfers ownership to new instance
     */
    FramePathRAII(const FramePathRAII& other)
        : path_(other.path_)
        , data_folder_(other.data_folder_)
        , frames_folder_(other.frames_folder_)
        , frame_id_(other.frame_id_)
        , busy_suffix_(other.busy_suffix_)
        , should_release_(other.should_release_) {
        // Transfer ownership - only one instance should release
        const_cast<FramePathRAII&>(other).should_release_ = false;
    }

    /**
     * Assignment operator - transfers ownership to this instance
     */
    FramePathRAII& operator=(const FramePathRAII& other) {
        if (this != &other) {
            // Release current resource if owned
            if (should_release_) {
                release_frame_lock();
            }
            
            // Copy new values
            path_ = other.path_;
            data_folder_ = other.data_folder_;
            frames_folder_ = other.frames_folder_;
            frame_id_ = other.frame_id_;
            busy_suffix_ = other.busy_suffix_;
            should_release_ = other.should_release_;
            
            // Transfer ownership
            const_cast<FramePathRAII&>(other).should_release_ = false;
        }
        return *this;
    }

    /**
     * Destructor - automatically calls release_frame_lock_cpp
     */
    ~FramePathRAII() {
        if (should_release_) {
            release_frame_lock();
        }
    }

    /**
     * Get the frame path as a string
     */
    const std::string& str() const {
        return path_;
    }

    /**
     * Get the frame path as a C-style string
     */
    const char* c_str() const {
        return path_.c_str();
    }

    /**
     * Implicit conversion to std::string for compatibility
     */
    operator const std::string&() const {
        return path_;
    }

    /**
     * Check if the path is empty
     */
    bool empty() const {
        return path_.empty();
    }

    /**
     * Get the size of the path string
     */
    size_t size() const {
        return path_.size();
    }

    /**
     * Manually release the frame lock (can be called explicitly if needed)
     */
    void release_frame_lock() {
        if (should_release_ && !path_.empty()) {
            vad::release_frame_lock_cpp(data_folder_, frames_folder_, frame_id_, busy_suffix_);
            should_release_ = false; // Prevent double release
        }
    }

    /**
     * Disable automatic release (use with caution)
     */
    void disable_auto_release() {
        should_release_ = false;
    }
};

} // namespace vad

#endif // FRAME_PATH_RAII_H