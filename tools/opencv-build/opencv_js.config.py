# Minimal OpenCV.js whitelist for doc-scanner-pdf (core + imgproc only).
# Used by .github/workflows/opencv-build.yml via build_js.py --config.
# Keeping the build small makes the WebAssembly download/compile much faster on phones.

core = {
    '': [
        'absdiff', 'add', 'addWeighted', 'bitwise_and', 'bitwise_not', 'bitwise_or', 'convertScaleAbs',
        'countNonZero', 'divide', 'flip', 'inRange', 'LUT', 'mean', 'meanStdDev', 'merge', 'minMaxLoc',
        'multiply', 'normalize', 'rotate', 'split', 'subtract', 'transpose',
    ],
    'Algorithm': [],
}

imgproc = {
    '': [
        'Canny', 'GaussianBlur', 'adaptiveThreshold', 'approxPolyDP', 'arcLength', 'boundingRect',
        'connectedComponentsWithStats', 'contourArea', 'convexHull', 'createCLAHE', 'cvtColor', 'dilate',
        'equalizeHist', 'erode', 'findContours', 'getPerspectiveTransform', 'getStructuringElement',
        'isContourConvex', 'medianBlur', 'minAreaRect', 'morphologyEx', 'resize', 'threshold',
        'warpPerspective',
    ],
    'CLAHE': ['apply', 'collectGarbage', 'getClipLimit', 'getTilesGridSize', 'setClipLimit', 'setTilesGridSize'],
}

white_list = makeWhiteList([core, imgproc])
