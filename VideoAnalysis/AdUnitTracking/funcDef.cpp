#include <opencv2/opencv.hpp>
#include "decomposition.h"
#include "funcDef.h"
#include "vgg_interp2.h"

#include <iostream>
#include <sstream>
#include <fstream>

using namespace cv;
using namespace std;

/*  x: number to be converted to a string
	length: length of the resulted string */

string itos(int x, int length)
{
	string result;          // string which will contain the result
	ostringstream convert;   // stream used for the conversion
	convert << x;      // insert the textual representation of 'Number' in the characters in the stream
	result = convert.str(); // set 'Result' to the contents of the stream
	return result;
}

Mat LoadImages(const string path, const string imageName, const int nb, const int length, const string imageFormat)
{
	string snb;
	string imgName;
	Mat imgCur;

	snb = itos(nb, length);
	imgName = path + imageName + snb + imageFormat;
	imgCur = imread(imgName);
	return imgCur;
}

void Meshgrid(const Range x, const Range y, Mat &outX, Mat &outY)
{
	vector<int> vecx,vecy;
	Mat tx,ty;

	tx.create( y.end - y.start + 1, x.end - x.start + 1, CV_8UC1 );
	ty.create( y.end - y.start + 1, x.end - x.start + 1, CV_8UC1 );

	int i;

	for( i = x.start; i <= x.end; i++ )
	{
		vecx.push_back( i );
	}
	for( i = y.start; i <= y.end; i++ )
	{
		vecy.push_back( i );
	}
	
	Mat vectorX = Mat(vecx);
	Mat vectorY = Mat(vecy);

	repeat( vectorX, 1, y.end - y.start + 1, tx );
	repeat( vectorY.t(), x.end - x.start + 1, 1, ty );
	outX = tx;
	outY = ty;
}

Mat Warp(const Mat &src, const Mat &H33, const int sizeX, const int sizeY)
{
	Mat warped;
	Mat x,y,z;
	Mat imx,imy;

	Range rangeX(1, sizeX);
	Range rangeY(1, sizeY);

	Meshgrid(rangeX, rangeY, imx, imy);

	int type = CV_64FC1;
	imx.convertTo(imx, CV_64FC1);
	imy.convertTo(imy, CV_64FC1);

	Mat onesMat = Mat::ones(sizeX, sizeY, type);

	x = H33.at<double>(0, 0) * imy + H33.at<double>(0, 2) * onesMat;
	y = H33.at<double>(1, 1) * imx + H33.at<double>(1, 2) * onesMat;
	z = H33.at<double>(2, 2) * onesMat;

	x = x/z;
	y = y/z;

	// The fourth parameter represents the default value in matlab its NaN
	vgg_interp2(src, x, y, "linear", 1 , warped);

	return warped;
}

/* Notice that the result acquired is different from Matlab
[gx gy] = gradient(src);
gx is y and gy is x;
the coordinate used in Matlab is different from the coordinate used in OpenCV. */

int Gradient(Mat &src, Mat &x, Mat &y)
{
	int col = src.cols;
	int row = src.rows;
	int type = src.type();
	int result = 0;

	if(type != 6)
	{
		src.convertTo(src, CV_64FC1);
	}

	if((src.channels() != 1)||(src.dims != 2))
	{
		cout << "Bad input arguement!" << endl;
		result = -1;
	}
	else
	{
		Mat xTemp(row, col, CV_64FC1);
		Mat yTemp(row, col, CV_64FC1);

		if(row > 1)
		{
			xTemp.row(0) = src.row(1) - src.row(0);
			xTemp.row(row - 1) = src.row(row -1) - src.row(row - 2);
			for(int i = 1; i < row - 1; i++)
			{
				xTemp.row(i) = (src.row(i+1) - src.row(i-1))/2;
			}
			y = xTemp;
		}
		else
		{
			xTemp = Mat::zeros(1, col, CV_64FC1);
			y = xTemp;
		}

		if(col > 1)
		{
			yTemp.col(0) = src.col(1) - src.col(0);
			yTemp.col(col - 1) = src.col(col - 1) - src.col(col - 2);
			for(int i = 1; i < col - 1; i++)
			{
				yTemp.col(i) = (src.col(i+1) - src.col(i-1))/2;
			}
			x = yTemp;
		}
		else
		{
			yTemp = Mat::zeros(row, 1, CV_64FC1);
			x = yTemp;
		}
	}

	src.convertTo(src, type);
	return result;		
}

Mat Jacobian(Mat &gradX, Mat &gradY, int nbPixels, int sizeX, int sizeY)
{
	Mat x,y;
	Mat xjx,yjy;
	Mat sum;
	Mat j;

	Range rangeX(1, sizeX);
	Range rangeY(1, sizeY);

	Meshgrid(rangeX, rangeY, x, y);
	x.convertTo(x, CV_64FC1);
	x = x.reshape(0, 1);

	y.convertTo(y, CV_64FC1);
	y = y.reshape(0, 1);

	gradX = gradX.t();
	gradX = gradX.reshape(0, 1);

	gradY = gradY.t();
	gradY = gradY.reshape(0, 1);

	xjx = x.mul(gradX);
	xjx = xjx.t();
	yjy = y.mul(gradY);
	yjy = yjy.t();

	sum = 3*(xjx + yjy);

	j.create(nbPixels, 3, CV_64FC1);
	gradX = gradX.t();
	gradY = gradY.t();
	gradX.copyTo(j.col(0));
	gradY.copyTo(j.col(1));
	sum.copyTo(j.col(2));

	return j;
}

Mat Expm(Mat &src)
{
	/*input matrix src mustn't be a singular matrix,
	otherwise the function will jam at "EigenvalueDecomposition eig(src)"*/

	if(src.type() != 6)
	{
		src.convertTo(src, CV_64FC1);
	}
	EigenvalueDecomposition eig(src);
	Mat value = eig.eigenvalues();
	Mat vector = eig.eigenvectors();

	exp(value,value);
	Mat mask = Mat::eye(3, 3, CV_64FC1);
	mask.at<double>(0,0) = value.at<double>(0,0);
	mask.at<double>(1,1) = value.at<double>(0,1);
	mask.at<double>(2,2) = value.at<double>(0,2);

	Mat ex;
	ex = vector * mask;
	ex = ex * vector.inv(0);

	return ex;
}

void Tracking(Mat &H, const Mat &grayCur, const Mat &temp, const int pixel, int sizeX, int sizeY, const Mat &gxImage, const Mat &gyImage, const double epsilon, const int maxIter)
{
	Mat warped;
	Mat warpOpenCV; // used to compare against the custom Warp() result
	int iters;
	for(iters = 1; iters < maxIter; iters++)
	{
		warped = Warp(grayCur, H, sizeX, sizeY);
		warpPerspective(grayCur, warpOpenCV, H, Size(sizeX, sizeY), INTER_LINEAR, BORDER_CONSTANT, cv::Scalar());

		Mat gx, gy;
		Gradient(warped, gx, gy);
		gx += gxImage;
		gy += gyImage;

		Mat di;
		di.create(sizeX, sizeY, CV_64FC1);

		di = warped - temp;

		di = di.t();
		di = di.reshape(0, 1);
		di = di.t();

		Mat J;
		J = Jacobian(gx, gy, pixel, sizeX, sizeY);
		
		Mat pinvJ;
		pinvJ = J.inv(DECOMP_SVD);
		
		Mat d;
		d = (-2) * pinvJ * di;

		Matx33d A(0,0,0,0,0,0,0,0,0);
		A(0,0)  = 0.5 * d.at<double>(2);
		A(0,2)  = d.at<double>(0);
		A(1,1)  = 0.5 * d.at<double>(2);
		A(1,2)  = d.at<double>(1);
		A(2,2)  = -d.at<double>(2);

		d.convertTo(d, CV_32F);
		Scalar s = sum(abs(d));

		if (s(0) < epsilon)
		{
			break;
		}
		d.convertTo(d, CV_64F);

		Mat ex;
		Mat matA(A);
		ex = Expm(matA);
		H = H * ex;
	}
}

void ConvertToRect(const vector<cv::Point2f>& vPts, cv::Rect& dstRect)
{
	// this is a test version, will improve later.
	dstRect.x = int(max(vPts[0].x, vPts[3].x));
	dstRect.y = int(max(vPts[0].y, vPts[1].y));
	dstRect.width = int(min(vPts[1].x, vPts[2].x)) - dstRect.x;
	dstRect.height = int(min(vPts[2].y, vPts[3].y)) - dstRect.y;
}

void AdjustInitPoints(vector<Mat> &vInitPoints, const Point &upLeft)
{
	for (vector<Mat>::iterator it = vInitPoints.begin(); it != vInitPoints.end(); it++)
	{
		(*it).at<double>(0, 0) -= upLeft.x;
		(*it).at<double>(1, 0) -= upLeft.y;
	}
}

void DrawPoints(Mat &H, Rect &roi, double ratio, vector<Point2f> &vRoiProjPoints)
{
	double widthScaled = (roi.width - 1) / ratio;
	double heightScaled = (roi.height - 1) / ratio;

	Mat pt1 = (Mat_<double>(3, 1) << 0, 0, 1);
	Mat pt2 = (Mat_<double>(3, 1) << widthScaled, 0, 1);
	Mat pt3 = (Mat_<double>(3, 1) << widthScaled, heightScaled, 1);
	Mat pt4 = (Mat_<double>(3, 1) << 0, heightScaled, 1);

	Mat newPt1 = H * pt1;
	newPt1 = newPt1 / newPt1.at<double>(2, 0);

	Mat newPt2 = H * pt2;
	newPt2 = newPt2 / newPt2.at<double>(2, 0);

	Mat newPt3 = H * pt3;
	newPt3 = newPt3 / newPt3.at<double>(2, 0);

	Mat newPt4 = H * pt4;
	newPt4 = newPt4 / newPt4.at<double>(2, 0);

	vRoiProjPoints.push_back(Point2f(newPt1.at<double>(0, 0) * ratio, newPt1.at<double>(1, 0) * ratio));
	vRoiProjPoints.push_back(Point2f(newPt2.at<double>(0, 0) * ratio, newPt2.at<double>(1, 0) * ratio));
	vRoiProjPoints.push_back(Point2f(newPt3.at<double>(0, 0) * ratio, newPt3.at<double>(1, 0) * ratio));
	vRoiProjPoints.push_back(Point2f(newPt4.at<double>(0, 0) * ratio, newPt4.at<double>(1, 0) * ratio));
}

void DrawPoints(Mat &H, vector<Mat> &vPoints, double ratio, vector<Point2f> &vProjPoints)
{
	const int nPointCount = 4;
	Point2f drawPts[nPointCount];

	for (int i = 0; i < nPointCount; i++)
	{
		Mat pt = vPoints[i] / ratio;
		pt = H * pt;
		pt = pt / pt.at<double>(2, 0);

		drawPts[i] = Point2f(pt.at<double>(0, 0) * ratio, pt.at<double>(1, 0) * ratio);
		vProjPoints.push_back(drawPts[i]);
	}
}