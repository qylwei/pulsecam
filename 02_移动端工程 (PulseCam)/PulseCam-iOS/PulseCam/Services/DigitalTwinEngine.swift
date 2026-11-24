import Foundation

/// 数字孪生趋势预测：最小二乘线性回归 + 每周周期项，预测未来恢复走势与疲劳风险。
enum DigitalTwinEngine {
    static func predictNext(days: Int, history: [DailyHealthPoint]) -> [TwinPrediction] {
        let fallback: (Int) -> TwinPrediction = { i in
            TwinPrediction(date: Calendar.current.date(byAdding: .day, value: i, to: Date()) ?? Date(),
                           recoveryScore: history.last?.recoveryScore ?? 75,
                           stressLevel: Int(history.last?.stressIndex ?? 30))
        }
        guard history.count >= 3 else {
            return (1...days).map(fallback)
        }
        let pts = history.sorted { $0.date < $1.date }
        let xs = pts.enumerated().map { Double($0.offset) }
        let ys = pts.map { Double($0.recoveryScore) }
        let (slope, intercept) = leastSquares(xs, ys)

        return (1...days).map { i -> TwinPrediction in
            let t = Double(pts.count + i - 1)
            var score = intercept + slope * t
            score += 2.5 * sin(Double(i) / 7 * 2 * Double.pi)
            score = max(20, min(100, score))
            let stress = max(5, min(95, 100 - score))
            return TwinPrediction(date: Calendar.current.date(byAdding: .day, value: i, to: Date()) ?? Date(),
                                  recoveryScore: Int(score.rounded()),
                                  stressLevel: Int(stress.rounded()))
        }
    }

    static func riskForecast(history: [DailyHealthPoint]) -> RiskForecast {
        let pts = history.sorted { $0.date < $1.date }.suffix(7).map { Double($0.recoveryScore) }
        guard pts.count >= 2 else {
            return RiskForecast(level: "低风险", days: (1...3).map { RiskDay(dayOffset: $0, riskPercent: 15) })
        }
        let slope = (pts.last! - pts.first!) / Double(pts.count - 1)
        let last = pts.last!
        let baseRisk: Double
        if slope < -2 && last < 65 {
            baseRisk = 70
        } else if slope < -1 || last < 70 {
            baseRisk = 45
        } else {
            baseRisk = 18
        }
        let days = (1...3).map { i -> RiskDay in
            let variation = Double((i * 7) % 10) * 1.5
            let p = max(5, min(95, baseRisk + variation + slope * Double(i) * 2))
            return RiskDay(dayOffset: i, riskPercent: Int(p.rounded()))
        }
        let level: String
        switch baseRisk {
        case ..<30: level = "低风险"
        case ..<55: level = "中风险"
        default: level = "高风险"
        }
        return RiskForecast(level: level, days: days)
    }

    /// 最小二乘：y = a·x + b，返回 (a, b)。
    private static func leastSquares(_ xs: [Double], _ ys: [Double]) -> (Double, Double) {
        let n = Double(xs.count)
        let mx = xs.reduce(0, +) / n
        let my = ys.reduce(0, +) / n
        var num = 0.0
        var den = 0.0
        for i in 0..<xs.count {
            num += (xs[i] - mx) * (ys[i] - my)
            den += (xs[i] - mx) * (xs[i] - mx)
        }
        let a = den > 0 ? num / den : 0
        let b = my - a * mx
        return (a, b)
    }
}
