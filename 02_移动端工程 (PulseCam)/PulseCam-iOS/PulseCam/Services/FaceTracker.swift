import Foundation
import CoreVideo
import Vision

struct FaceInfo {
    var boundingBox: CGRect
    var roi: CGRect
}

/// Vision 人脸 ROI 检测 + 绿色通道均值提取。
enum FaceTracker {
    static func detect(in pixelBuffer: CVPixelBuffer) -> FaceInfo? {
        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .up, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return nil
        }
        guard let observation = request.results?.first else { return nil }
        let bb = observation.boundingBox
        // 取双颊区域，避开额头反光、眼部与口部
        let roi = CGRect(x: bb.origin.x + bb.width * 0.22,
                         y: bb.origin.y + bb.height * 0.30,
                         width: bb.width * 0.56,
                         height: bb.height * 0.38)
        return FaceInfo(boundingBox: bb, roi: roi)
    }

    /// Vision 坐标系原点在左下角，CVPixelBuffer 首行在顶部，做一次 y 翻转。
    static func greenMean(in pixelBuffer: CVPixelBuffer, roi: CGRect) -> Float {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else { return 0 }
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)

        let x0 = max(0, min(width, Int(roi.minX * CGFloat(width))))
        let x1 = max(0, min(width, Int(roi.maxX * CGFloat(width))))
        let yTop0 = max(0, min(height, Int((1 - roi.maxY) * CGFloat(height))))
        let yTop1 = max(0, min(height, Int((1 - roi.minY) * CGFloat(height))))
        guard x1 > x0, yTop1 > yTop0 else { return 0 }

        var sum: Float = 0
        var count = 0
        for y in stride(from: yTop0, to: yTop1, by: 2) {
            let row = base.advanced(by: y * bytesPerRow)
            var px = row.advanced(by: x0 * 4)
            var x = x0
            while x < x1 {
                sum += Float(px.load(fromByteOffset: 1, as: UInt8.self))
                count += 1
                px = px.advanced(by: 4)
                x += 1
            }
        }
        return count > 0 ? sum / Float(count) : 0
    }
}
