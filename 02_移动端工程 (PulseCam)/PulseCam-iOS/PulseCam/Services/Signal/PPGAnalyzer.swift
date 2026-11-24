import Foundation

enum PPGAnalyzer {
    static let fs: Float = 30

    /// 核心 rPPG 分析管线：去趋势 → 带通滤波 → FFT 心率 → 峰值 IBI → HRV → RSA 呼吸频率。
    static func analyze(_ samples: [Float]) -> PPGResult {
        let filter = SignalFilter(fs: fs)
        let detrended = filter.detrend(samples, window: Int(fs * 2))
        let hrBand = filter.bandpass(detrended, center: 1.6, bandwidth: 1.7)

        let spectrum = SpectrumAnalyzer()
        let hrPeak = spectrum.dominantFrequency(hrBand, fs: fs, lo: 0.8, hi: 2.5)
        let heartRate = Double(hrPeak?.frequency ?? 0) * 60
        let hrConfidence = hrPeak.map { spectrum.confidence(snr: $0.snr) } ?? 0

        let peakIdx = PeakDetector.peaks(hrBand, minDistance: Int(fs * 0.4), thresholdFactor: 0.35)
        var ibi: [Double] = []
        if peakIdx.count >= 3 {
            for i in 1..<peakIdx.count {
                let interval = Double(peakIdx[i] - peakIdx[i - 1]) / Double(fs)
                if interval > 0.4 && interval < 1.6 {
                    ibi.append(interval)
                }
            }
        }

        let hrv = ibi.count >= 5 ? HRVCalculator.compute(ibi: ibi, fs: fs) : nil
        let respiratoryRate = estimateRespiratoryRate(ibi: ibi)
        let quality = min(1, hrConfidence)

        return PPGResult(heartRate: heartRate,
                         hrConfidence: hrConfidence,
                         respiratoryRate: respiratoryRate,
                         ibi: ibi,
                         hrv: hrv,
                         quality: quality)
    }

    /// 呼吸频率估算：IBI 重采样为瞬时心率序列，0.1-0.5Hz 带内主频（呼吸性窦性心律不齐 RSA 通道）。
    private static func estimateRespiratoryRate(ibi: [Double]) -> Double {
        guard ibi.count >= 8 else { return 0 }
        var times = [Double](repeating: 0, count: ibi.count)
        var hrVals = [Double](repeating: 0, count: ibi.count)
        var acc = 0.0
        hrVals[0] = 60 / ibi[0]
        for i in 1..<ibi.count {
            acc += ibi[i]
            times[i] = acc
            hrVals[i] = 60 / ibi[i]
        }
        let total = times.last ?? 0
        guard total > 4 else { return 0 }
        let n = 256
        let dt = total / Double(n)
        var uniform = [Double](repeating: 0, count: n)
        var j = 0
        for i in 0..<n {
            let ti = Double(i) * dt
            while j < times.count - 2 && times[j + 1] < ti { j += 1 }
            let f = (ti - times[j]) / max(times[j + 1] - times[j], 1e-9)
            uniform[i] = hrVals[j] + (hrVals[j + 1] - hrVals[j]) * f
        }
        let m = uniform.reduce(0, +) / Double(n)
        let detrended = uniform.map { Float($0 - m) }
        let fs = Double(n) / total
        let spectrum = SpectrumAnalyzer()
        let peak = spectrum.dominantFrequency(detrended, fs: Float(fs), lo: 0.10, hi: 0.50)
        return Double(peak?.frequency ?? 0) * 60
    }
}
