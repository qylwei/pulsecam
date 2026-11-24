import Foundation
import Accelerate

struct HRVCalculator {
    /// IBI 单位为秒。输出 SDNN/RMSSD/pNN50（时域）与 LF/HF（频域，tachogram 重采样后 FFT）。
    static func compute(ibi: [Double], fs: Float = 30) -> HRVMetrics {
        let nn = ibi.map { $0 * 1000 }
        guard nn.count >= 3 else {
            return HRVMetrics(sdnn: 0, rmssd: 0, pnn50: 0, lf: 0, hf: 0, lfHfRatio: 0)
        }

        let mean = nn.reduce(0, +) / Double(nn.count)
        let sdnn = sqrt(nn.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(nn.count))

        var sumSq = 0.0
        var nn50 = 0
        for i in 1..<nn.count {
            let d = abs(nn[i] - nn[i - 1])
            sumSq += d * d
            if d > 50 { nn50 += 1 }
        }
        let rmssd = sqrt(sumSq / Double(nn.count - 1))
        let pnn50 = Double(nn50) / Double(nn.count - 1) * 100

        let (lf, hf) = ibi.reduce(0, +) >= 120 ? spectralBandPower(ibi: ibi) : (0, 0)
        let ratio = hf > 0.1 ? lf / hf : 0

        return HRVMetrics(sdnn: sdnn, rmssd: rmssd, pnn50: pnn50, lf: lf, hf: hf, lfHfRatio: ratio)
    }

    /// 对 IBI tachogram 线性重采样后做 FFT，积分 LF(0.04-0.15Hz) 与 HF(0.15-0.40Hz) 功率。
    private static func spectralBandPower(ibi: [Double]) -> (Double, Double) {
        guard ibi.count > 4 else { return (0, 0) }
        var times = [Double](repeating: 0, count: ibi.count)
        var acc = 0.0
        for i in 1..<ibi.count {
            acc += ibi[i - 1]
            times[i] = acc
        }
        let total = times.last ?? 0
        guard total > 2 else { return (0, 0) }
        let n = 256
        let dt = total / Double(n)
        var uniform = [Double](repeating: 0, count: n)
        var j = 0
        for i in 0..<n {
            let ti = Double(i) * dt
            while j < times.count - 2 && times[j + 1] < ti { j += 1 }
            let f = (ti - times[j]) / max(times[j + 1] - times[j], 1e-9)
            uniform[i] = ibi[j] + (ibi[j + 1] - ibi[j]) * f
        }
        let m = uniform.reduce(0, +) / Double(n)
        let detrended = uniform.map { $0 - m }
        let effectiveFs = Double(n) / total
        let powers = fftPower(detrended)
        let lf = integrate(powers, fs: effectiveFs, range: 0.04...0.15)
        let hf = integrate(powers, fs: effectiveFs, range: 0.15...0.40)
        return (lf, hf)
    }

    private static func fftPower(_ x: [Double]) -> [Double] {
        var n = 1
        while n < x.count { n *= 2 }
        let log2n = UInt(log2(Double(n)))
        guard let fft = vDSP.FFT(log2n: log2n, radix: .radix2, ofType: DSPDoubleSplitComplex.self) else { return [] }
        var real = [Double](repeating: 0, count: n)
        real.replaceSubrange(0..<x.count, with: x)
        var imag = [Double](repeating: 0, count: n)
        var mag = [Double](repeating: 0, count: n / 2)
        real.withUnsafeMutableBufferPointer { rp in
            imag.withUnsafeMutableBufferPointer { ip in
                let split = DSPDoubleSplitComplex(realp: rp.baseAddress!, imagp: ip.baseAddress!)
                fft.transform(input: split, realOutput: rp.baseAddress!, imagOutput: ip.baseAddress!)
                vDSP.absolute(split, result: &mag)
            }
        }
        return mag.map { $0 * $0 }
    }

    private static func integrate(_ power: [Double], fs: Double, range: ClosedRange<Double>) -> Double {
        let n = power.count * 2
        var sum = 0.0
        for (i, p) in power.enumerated() {
            let f = Double(i) * fs / Double(n)
            if range.contains(f) { sum += p }
        }
        return sum
    }
}
