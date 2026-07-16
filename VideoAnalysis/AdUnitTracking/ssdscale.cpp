#include <opencv2/opencv.hpp>
#include <ctime>
#include "ssdscale.h"
#include "funcDef.h"
#include "constant.h"

using namespace std;
using namespace cv;

cv::Mat getWindow(const cv::Mat &img, const Rect roi)
{

	Mat window = cv::Mat(img, roi);

	return window;
}

cv::Mat getTemplate(const cv::Mat &img, const Rect roi, const int area, cv::Size &size, double &factor)
{

	Mat originalWindow = getWindow(img, roi);
	Size originalSize = originalWindow.size();

	if (roi.area() > area)
	{
		factor = sqrt(area / double(roi.area()));
		Size destSize(int(originalSize.width * factor), int(originalSize.height * factor));
		resize(originalWindow, originalWindow, destSize, 0, 0, INTER_LINEAR);
	}

	size = originalWindow.size();
	return originalWindow;
}

Rect creatRoi(Rect &roi, double factor)
{

	int ulx = int(roi.x - roi.width * (factor - 1) / 2);
	int uly = int(roi.y - roi.height * (factor - 1) / 2);
	int width = int(roi.width * factor);
	int height = int(roi.height * factor);
	Rect newRoi(ulx, uly, width, height);

	return newRoi;
}

double updateScale(cv::Mat &temp, const cv::Mat &img, Rect &roi, const int area, cv::Size &size, double &factor)
{

	Rect newRoi = creatRoi(roi, 1.5);
	Mat subImage = getWindow(img, newRoi);

	Mat grayImage;
	cv::cvtColor(subImage, grayImage, cv::COLOR_BGR2GRAY);
	grayImage.convertTo(grayImage, CV_8UC1);
	cv::namedWindow("Window", cv::WINDOW_AUTOSIZE);
	cv::imshow("Window", grayImage);
	cv::waitKey();

	Mat scaleGray;
	cv::resize(grayImage, scaleGray, Size(0, 0), factor, factor, INTER_LINEAR);

	int sizeY = size.width;
	int sizeX = size.height;
	int pixel = sizeX * sizeY;

	Mat grayTemp;
	cv::cvtColor(temp, grayTemp, cv::COLOR_BGR2GRAY);
	grayTemp.convertTo(grayTemp, CV_64FC1);
	Mat gxTemp, gyTemp;
	int success = Gradient(grayTemp, gxTemp, gyTemp);

	double xPos = (int(roi.x) - newRoi.x) * factor;
	double yPos = (int(roi.y) - newRoi.y) * factor;

	Mat H = (Mat_<double>(3, 3) << 1, 0, xPos, 0, 1, yPos, 0, 0, 1);

	for (int iters = 0; iters < maxIter; ++iters)
	{

		Mat warped = Warp(scaleGray, H, sizeX, sizeY);

		Mat gx, gy;
		int success = Gradient(warped, gx, gy);
		gx += gxTemp;
		gy += gyTemp;

		Mat di;
		di.create(sizeX, sizeY, CV_64FC1);

		di = warped - grayTemp;
		di = di.t();
		di = di.reshape(0, 1);
		di = di.t();

		Mat J;
		J = Jacobian(gx, gy, pixel, sizeX, sizeY);

		Mat pinvJ;
		pinvJ = J.inv(DECOMP_SVD);

		Mat d;
		d = (-2) * pinvJ * di;

		Matx33d A(0, 0, 0, 0, 0, 0, 0, 0, 0);
		A(0, 0) = 0.5 * d.at<double>(2);
		A(0, 2) = d.at<double>(0);
		A(1, 1) = 0.5 * d.at<double>(2);
		A(1, 2) = d.at<double>(1);
		A(2, 2) = -d.at<double>(2);

		Mat ex;
		Mat matA(A);
		ex = Expm(matA);
		H = H * ex;

		double delta = d.at<double>(0, 0) + d.at<double>(1, 0) + d.at<double>(2, 0);
		if (delta < epsilon)
		{
			break;
		}
	}

	double scale = pow(H.at<double>(0, 0), 3);

	roi = creatRoi(roi, scale);
	size = Size(int(roi.width), int(roi.height));
	factor = factor / scale;

	return scale;
}

double updateScale(const cv::Mat &img, const cv::Mat &temp, const cv::Mat &gx, const cv::Mat &gy, Rect &roi, double currentScale)
{

	cv::Size sizeT = temp.size();
	int sizeX = sizeT.height;
	int sizeY = sizeT.width;
	int pixel = sizeX * sizeY;

	Mat H = (Mat_<double>(3, 3) << currentScale, 0, roi.x / pow(currentScale, 2), 0, currentScale, roi.y / pow(currentScale, 2), 0, 0, double(1) / pow(currentScale, 2));
	Tracking(H, img, temp, pixel, sizeX, sizeY, gx, gy, epsilon, maxIter);

	double scale = pow(H.at<double>(0, 0), 3);

	roi.x = int(H.at<double>(0, 2) / H.at<double>(2, 2));
	roi.y = int(H.at<double>(1, 2) / H.at<double>(2, 2));
	roi.width = roi.width * scale;
	roi.height = roi.height * scale;

	return scale;
}

cv::Mat initTemplate(Rect roi, string path, string imgName, int firstImg, string imgFormat, double &ratio, int &frameWidth, int &frameHeight)
{

	Mat img = LoadImages(path, imgName, firstImg, 1, imgFormat);
	if (img.empty())
	{
		std::cout << "NO image read!" << std::endl
				  << std::endl;
	}

	Mat grayImg;
	if (img.channels() != 1)
	{
		if (imgFormat.compare(".jpeg") == 0 || imgFormat.compare(".jpg"))
		{
			cvtColor(img, grayImg, cv::COLOR_YCrCb2BGR);
			cvtColor(grayImg, grayImg, cv::COLOR_BGR2GRAY);
		}
		else
		{
			cvtColor(img, grayImg, cv::COLOR_BGR2GRAY);
		}
	}
	else
	{
		grayImg = Mat(img);
	}
	Mat grayImgAfterBlur;

	medianBlur(grayImg, grayImgAfterBlur, 9);

	Mat imgForHist = grayImgAfterBlur(roi);

	frameWidth = grayImg.cols;
	frameHeight = grayImg.rows;

	Mat tempImg = Mat(grayImgAfterBlur, roi);

	tempImg.convertTo(tempImg, CV_64FC1);

	if (tempImg.total() >= maxArea)
	{
		ratio = double(tempImg.total()) / maxArea;
		resize(tempImg, tempImg, Size(0, 0), 1 / ratio, 1 / ratio);
	}

	Mat showTemp;
	tempImg.convertTo(showTemp, CV_8UC1);

	return tempImg;
}

cv::Mat initTemplate(const Mat &grayImg, const Rect &roi, double &ratio, int &frameWidth, int &frameHeight, Mat &showTemp)
{
	frameWidth = grayImg.cols;
	frameHeight = grayImg.rows;

	Mat grayImgAfterBlur;

	medianBlur(grayImg, grayImgAfterBlur, 9);

	Mat imgForHist = grayImgAfterBlur(roi);

	Mat tempImg = Mat(grayImgAfterBlur, roi);
	showTemp = Mat(grayImg, roi);

	tempImg.convertTo(tempImg, CV_64FC1);

	if (tempImg.total() >= maxArea)
	{
		ratio = double(tempImg.total()) / maxArea;
		resize(tempImg, tempImg, Size(0, 0), 1 / ratio, 1 / ratio);
		resize(showTemp, showTemp, Size(0, 0), 1 / ratio, 1 / ratio);
	}

	return tempImg;
}

double trackingSSD(Mat &H, Mat &grayCur, Mat &temp, const Mat &gxTemp, const Mat &gyTemp, Rect roi, double ratio, double &currentScale)
{
	double scale = 0;
	int pixel = temp.total();

	int sizeX = temp.rows;
	int sizeY = temp.cols;
	Mat grayCurAfterBlur;
	medianBlur(grayCur, grayCurAfterBlur, 9);
	Mat imgForHist = grayCurAfterBlur(roi);
	equalizeHist(imgForHist, imgForHist);

	Tracking(H, grayCurAfterBlur, temp, pixel, sizeX, sizeY, gxTemp, gyTemp, epsilon, maxIter);

	scale = H.at<double>(0, 0) / H.at<double>(2, 2) / currentScale;
	currentScale = H.at<double>(0, 0) / H.at<double>(2, 2);
	return scale;
}