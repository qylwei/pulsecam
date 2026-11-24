import Accelerate

struct SpectrumAnalyzer {
    func nextPowerOfTwo(_ v: Int) -> Int {
        var p = 1
        while p < v { p *= 2 }
        return p
    }

    /// 零填充 FFT，返回频率(Hz)与幅度谱（未归一化）。
    func powerSpectrum(_ samples: [Float], fs: Float) -> (frequencies: [Float], power: [Float]) {
        guard !samples.isEmpty else { return ([], []) }
        let n = min(nextPowerOfTwo(samples.count), 4096)
        let log2n = UInt(log2(Float(n)))
        guard let fft = vDSP.FFT(log2n: log2n, radix: .radix2, ofType: DSPSplitComplex.self) else { return ([], []) }

        var real = [Float](repeating: 0, count: n)
        real.replaceSubrange(0..<min(samples.count, n), with: samples)
        var imag = [Float](repeating: 0, count: n)
        var mag = [Float](repeating: 0, count: n / 2)

        real.withUnsafeMutableBufferPointer { rp in
            imag.withUnsafeMutableBufferPointer { ip in
                let split = DSPSplitComplex(realp: rp.baseAddress!, imagp: ip.baseAddress!)
                fft.transform(input: split, realOutput: rp.baseAddress!, imagOutput: ip.baseAddress!)
                vDSP.absolute(split, result: &mag)
            }
        }

        var freqs = [Float](repeating: 0, count: n / 2)
        var start: Float = 0
        var step: Float = fs / Float(n)
        vDSP.ramp(&freqs, &start, &step)

        return (freqs, mag)
    }

    /// 带内主频检测，附带 SNR 与抛物线插值细分。
    func dominantFrequency(_ samples: [Float], fs: Float, lo: Float, hi: Float) -> (frequency: Float, power: Float, snr: Float)? {
        let (freqs, power) = powerSpectrum(samples, fs: fs)
        guard !power.isEmpty else { return nil }
        var bestIdx = -1
        var bestPower: Float = 0
        var inBandSum: Float = 0
        var inBandCount: Float = 0
        for i in 0..<power.count {
            let f = freqs[i]
            if f >= lo && f <= hi {
                inBandSum += power[i]
                inBandCount += 1
                if power[i] > bestPower { bestPower = power[i]; bestIdx = i }
            }
        }
        guard bestIdx >= 0, bestPower > 0 else { return nil }
        let avg = inBandSum / max(inBandCount, 1)
        let snr = bestPower / max(avg, 1e-6)
        let freq = refinePeak(freqs, power, bestIdx)
        return (freq, bestPower, snr)
    }

    /// SNR → 0...1 置信度。
    func confidence(snr: Float) -> Float {
        min(1, max(0, (snr - 1.5) / 6.0))
    }

    private func refinePeak(_ freqs: [Float], _ power: [Float], _ idx: Int) -> Float {
        guard idx > 0, idx < power.count - 1 else { return freqs[idx] }
        let a = power[idx - 1]
        let b = power[idx]
        let c = power[idx + 1]
        let denom = a - 2 * b + c
        guard abs(denom) > 1e-9 else { return freqs[idx] }
        let delta = 0.5 * (a - c) / denom
        return freqs[idx] + delta * (freqs[idx + 1] - freqs[idx])
    }
}
