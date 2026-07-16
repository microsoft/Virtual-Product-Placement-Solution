#ifndef UTILS_H
#define UTILS_H

#include <stdio.h>
#include <cmath>
#include <fstream>
#include <experimental/filesystem>
#include <vector>
#include <limits>
#include <string>
#include <algorithm>

#include <opencv2/opencv.hpp>
#include <opencv2/core.hpp>

#include <nlohmann/json.hpp>
using json = nlohmann::json;
namespace fs = std::experimental::filesystem;

#define M_PI 3.14159265358979323846

// json conversions
namespace std
{
inline void to_json(json &j, const vector<cv::Point2f> &unit)
{
	for (size_t i = 0; i < unit.size(); ++i)
	{
		j.push_back(json{unit[i].x, unit[i].y});
	}
}
inline void from_json(const json &j, vector<cv::Point2f> &unit)
{
	for (auto itr = j.begin(); itr != j.end(); ++itr)
	{
		unit.push_back(cv::Point2f((*itr)[0], (*itr)[1]));
	}
}
} // namespace std

// load cfg
inline void load_json_file(const std::string &filename, json &cfg)
{
	if (fs::exists(filename))
	{
		std::fstream f(filename, std::ios::in);
		f >> cfg;

		f.close();
	}
	else
	{
		std::cerr << "could not find configuration file path: " << filename << std::endl;
		exit(-1);
	}
}

inline std::vector<cv::Point> convert_points(const std::vector<cv::Point2f> &src)
{
	std::vector<cv::Point> dst;
	for (size_t i = 0; i < src.size(); ++i)
	{
		cv::Point p((int)src[i].x, (int)src[i].y);
		dst.push_back(p);
	}

	return dst;
}

inline void order_points(std::vector<cv::Point2f> &pts)
{
	assert(pts.size() == 4);

	std::sort(pts.begin(), pts.end(), [](cv::Point2f a, cv::Point2f b) {
		return a.x < b.x;
	});

	if (pts[0].y > pts[1].y)
	{
		std::swap(pts[0], pts[1]);
	}
	if (pts[2].y < pts[3].y)
	{
		std::swap(pts[2], pts[3]);
	}
	std::swap(pts[1], pts[3]);
}

inline bool is_duplicate(const std::vector<cv::Point2f> &pts, const cv::Point2f p)
{
	for (size_t i = 0; i < pts.size(); ++i)
	{
		if (std::abs(cv::norm(pts[i] - p)) < 1e-6)
		{
			return true;
		}
	}

	return false;
}

inline float ncc(const cv::Mat &ref, const cv::Mat &cur)
{
	if (ref.channels() != 1 or cur.channels() != 1)
	{
		std::cerr << "only signle channel matrices are supported" << std::endl;
	}
	cv::Scalar miu_ref = cv::mean(ref);
	cv::Scalar miu_cur = cv::mean(cur);

	cv::Mat ref_, cur_;
	cv::subtract(ref, miu_ref, ref_, cv::noArray(), CV_64F);
	cv::subtract(cur, miu_cur, cur_, cv::noArray(), CV_64F);

	float num = cv::sum(ref_.mul(cur_))[0];
	float denom = std::sqrt(cv::sum(ref_.mul(ref_))[0]) * std::sqrt(cv::sum(cur_.mul(cur_))[0]) + 1e-6;

	return num / denom;
}

inline void get_front_view(const cv::Mat &img, const std::vector<cv::Point2f> &unit,
						   const int width, const int height, cv::Mat &img_unit_front)
{
	std::vector<cv::Point2f> unit_front;
	unit_front.push_back(cv::Point2f(0, 0));
	unit_front.push_back(cv::Point2f(width - 1, 0));
	unit_front.push_back(cv::Point2f(width - 1, height - 1));
	unit_front.push_back(cv::Point2f(0, height - 1));

	cv::Mat M = cv::getPerspectiveTransform(unit, unit_front);
	cv::warpPerspective(img, img_unit_front, M, cv::Size(width, height), cv::INTER_LINEAR, cv::BORDER_CONSTANT);
}

//TODO: Check for even/uneven number of elements
//The order of the elements of A is changed
inline float median(std::vector<float> &A)
{
	if (A.size() == 0)
	{
		return std::numeric_limits<float>::quiet_NaN();
	}

	std::nth_element(A.begin(), A.begin() + A.size() / 2, A.end());

	return A[A.size() / 2];
}

// angle is measured in radians
inline cv::Point2f rotate(const cv::Point2f &v, const float angle)
{
	cv::Point2f r;
	r.x = std::cos(angle) * v.x - std::sin(angle) * v.y;
	r.y = std::sin(angle) * v.x + std::cos(angle) * v.y;

	return r;
}

template <class T>
inline int sgn(T x)
{
	if (x >= 0)
		return 1;
	else
		return -1;
}

inline float intersection_over_union(const cv::Rect &bbox1, const cv::Rect &bbox2)
{
	// x, y, w, h
	int bi[4];
	bi[0] = std::max(bbox1.x, bbox2.x);
	bi[1] = std::max(bbox1.y, bbox2.y);
	bi[2] = std::min(bbox1.x + bbox1.width - 1, bbox2.x + bbox2.width - 1);
	bi[3] = std::min(bbox1.y + bbox1.height - 1, bbox2.y + bbox2.height - 1);

	float iw = bi[2] - bi[0] + 1.;
	float ih = bi[3] - bi[1] + 1.;
	float ov = 0;
	if (iw > 0 && ih > 0)
	{
		float ua = bbox1.width * bbox1.height + bbox2.width * bbox2.height - iw * ih;
		ov = iw * ih / ua;
	}

	return ov;
}

template <typename T>
inline std::vector<size_t> ordered_indices(std::vector<T> const &values) // decrease
{
	std::vector<size_t> indices(values.size());
	std::iota(begin(indices), end(indices), static_cast<size_t>(0));

	std::sort(
		begin(indices), end(indices),
		[&](size_t a, size_t b) { return values[a] > values[b]; });
	return indices;
}

#endif