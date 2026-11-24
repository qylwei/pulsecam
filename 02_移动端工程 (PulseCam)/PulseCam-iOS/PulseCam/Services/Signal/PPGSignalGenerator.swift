import Foundation

/// 合成 rPPG 信号，用于模拟器 / 无相机环境下端到端验证算法与演示。
enum PPGSignalGenerator {
    static func synthesize(fs: Float, seconds: Float, heartRate: Float, respiratoryRate: Float = 14, amplitude: Float = 1) -> [Float] {
        let count = Int(fs * seconds)
        let meanIBI = 60 / heartRate

        // 逐拍间隔：呼吸调制（RSA）+ 随机抖动
        var ibi: [Float] = []
        var acc: Float = 0
        var beatTimes: [Float] = [0]
        for i in 0..<count {
            let t = Float(i) / fs
            let rsa = 1 + 0.07 * sin(2 * Float.pi * respiratoryRate / 60 * t)
            let jitter = Float.random(in: -0.012...0.012)
            let interval = meanIBI * rsa + jitter
            ibi.append(interval)
            acc += interval
            if acc < seconds { beatTimes.append(acc) }
        }

        var sig = [Float](repeating: 0, count: count)
        var bi = 0
        for i in 0..<count {
            let t = Float(i) / fs
            while bi + 1 < beatTimes.count && beatTimes[bi + 1] < t { bi += 1 }
            var v: Float = 0
            for k in max(0, bi - 1)...min(beatTimes.count - 1, bi + 1) {
                let dt = t - beatTimes[k]
                let sigma: Float = 0.09
                let g = exp(-dt * dt / (2 * sigma * sigma))
                if g > 0.01 { v += g * amplitude }
            }
            let resp = 1 + 0.06 * sin(2 * Float.pi * respiratoryRate / 60 * t - 0.5)
            let noise = 0.02 * amplitude * (Float.random(in: 0...1) - 0.5)
            sig[i] = v * resp + 0.3 * amplitude + noise
        }
        return sig
    }
}
