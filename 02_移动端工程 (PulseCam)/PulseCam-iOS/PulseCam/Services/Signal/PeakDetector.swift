import Foundation

enum PeakDetector {
    /// 自适应阈值峰值检测：RMS 比例阈值 + 最小间距。
    static func peaks(_ x: [Float], minDistance: Int, thresholdFactor: Float = 0.4) -> [Int] {
        guard x.count > 2 else { return [] }
        let rms = sqrt(x.reduce(0) { $0 + $1 * $1 } / Float(x.count))
        guard rms > 0 else { return [] }
        let threshold = rms * thresholdFactor
        var result: [Int] = []
        var i = 1
        while i < x.count - 1 {
            if x[i] > threshold, x[i] >= x[i - 1], x[i] > x[i + 1] {
                if let last = result.last, i - last < minDistance {
                    if x[i] > x[last] { result[result.count - 1] = i }
                } else {
                    result.append(i)
                }
            }
            i += 1
        }
        return result
    }
}
