import Accelerate

struct SignalFilter {
    let fs: Float

    struct Biquad {
        var b0: Float
        var b1: Float
        var b2: Float
        var a1: Float
        var a2: Float
    }

    /// 去除基线漂移：滑动均值窗减去慢变分量。
    func detrend(_ x: [Float], window: Int) -> [Float] {
        guard x.count > window, window > 1 else { return x }
        var prefix = [Float](repeating: 0, count: x.count + 1)
        for i in 0..<x.count { prefix[i + 1] = prefix[i] + x[i] }
        let half = window / 2
        var y = [Float](repeating: 0, count: x.count)
        for i in 0..<x.count {
            let lo = max(0, i - half)
            let hi = min(x.count - 1, i + half)
            let mean = (prefix[hi + 1] - prefix[lo]) / Float(hi - lo + 1)
            y[i] = x[i] - mean
        }
        return y
    }

    /// 2 阶带通，Audio EQ Cookbook（0 dB 峰值增益）。中心频率与带宽单位为 Hz。
    func bandpassCoeffs(center: Float, bandwidth: Float) -> Biquad {
        let omega0 = 2 * Float.pi * center / fs
        let q = center / max(bandwidth, 0.05)
        let alpha = sin(omega0) / (2 * q)
        let a0 = 1 + alpha
        return Biquad(b0: alpha * q / a0,
                      b1: 0,
                      b2: -alpha * q / a0,
                      a1: -2 * cos(omega0) / a0,
                      a2: (1 - alpha) / a0)
    }

    /// vDSP_biquad 加速滤波。
    func bandpass(_ x: [Float], center: Float, bandwidth: Float) -> [Float] {
        guard !x.isEmpty else { return x }
        var coeffs = bandpassCoeffs(center: center, bandwidth: bandwidth)
        guard let setup = vDSP_biquadCreateSetup(nil, &coeffs.b0, 1) else { return x }
        defer { vDSP_biquadDestroySetup(setup) }
        var out = [Float](repeating: 0, count: x.count)
        x.withUnsafeBufferPointer { inPtr in
            out.withUnsafeMutableBufferPointer { outPtr in
                vDSP_biquad(setup, inPtr.baseAddress!, 1, outPtr.baseAddress!, 1, vDSP_Length(x.count))
            }
        }
        return out
    }
}
