import Foundation

enum Scenario: String, CaseIterable, Codable, Identifiable {
    case daily = "日常"
    case interview = "面试"
    case exam = "考试"
    case sport = "运动"
    case menstrual = "经期"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .daily: "sun.max.fill"
        case .interview: "briefcase.fill"
        case .exam: "book.fill"
        case .sport: "figure.run"
        case .menstrual: "moon.fill"
        }
    }

    var advice: String {
        switch self {
        case .daily:
            "当前状态良好，保持规律作息。建议每天完成 30 分钟轻度活动。"
        case .interview:
            "面试前放松，控制压力指数。建议深呼吸 2 分钟，避免高咖啡因摄入。"
        case .exam:
            "备考期间维持充足睡眠，建议今晚 23 点前入睡以巩固记忆。"
        case .sport:
            "运动前先测量基线心率，建议心率控制在最大心率的 60%-80% 区间。"
        case .menstrual:
            "经期激素波动可能影响 HRV，属正常现象。注意补水与适度休息。"
        }
    }

    var measurementNote: String {
        switch self {
        case .daily: "日常模式 · 30 秒快速测量"
        case .interview: "面试模式 · 关注压力指数"
        case .exam: "考试模式 · 关注恢复与睡眠"
        case .sport: "运动模式 · 关注静息心率"
        case .menstrual: "经期模式 · 温和监测"
        }
    }
}

enum RecoveryLevel: String {
    case excellent = "极佳恢复状态"
    case good = "恢复良好"
    case fair = "一般恢复状态"
    case poor = "需要更多休息"

    var symbol: String {
        switch self {
        case .excellent: "sun.max.fill"
        case .good: "cloud.sun.fill"
        case .fair: "cloud.fill"
        case .poor: "moon.zzz.fill"
        }
    }

    static func level(for score: Int) -> RecoveryLevel {
        switch score {
        case 85...: .excellent
        case 70..<85: .good
        case 55..<70: .fair
        default: .poor
        }
    }
}

struct HRVMetrics: Codable, Equatable {
    var sdnn: Double
    var rmssd: Double
    var pnn50: Double
    var lf: Double
    var hf: Double
    var lfHfRatio: Double
}

struct PPGResult {
    var heartRate: Double
    var hrConfidence: Double
    var respiratoryRate: Double
    var ibi: [Double]
    var hrv: HRVMetrics?
    var quality: Double
}

struct HealthSnapshot: Codable, Identifiable, Equatable {
    var id = UUID()
    var date: Date
    var scenario: Scenario
    var heartRate: Double
    var hrvSDNN: Double
    var respiratoryRate: Double
    var stressIndex: Double
    var recoveryScore: Int
    var sleepHours: Double?
    var quality: Double
}

struct DailyHealthPoint: Codable, Identifiable, Equatable {
    var id = UUID()
    var date: Date
    var recoveryScore: Int
    var hrvSDNN: Double
    var stressIndex: Double
    var sleepHours: Double?
}

struct MetricTrend: Identifiable {
    var id = UUID()
    var label: String
    var value: String
    var delta: Double
    var goodWhenUp: Bool
}

struct Recommendation: Identifiable {
    var id = UUID()
    var title: String
    var symbol: String
}

struct RiskDay: Identifiable {
    var id: Int { dayOffset }
    var dayOffset: Int
    var riskPercent: Int
    var title: String { "D+\(dayOffset)" }
}

struct TwinPrediction: Identifiable {
    var id = UUID()
    var date: Date
    var recoveryScore: Int
    var stressLevel: Int
}

struct RiskForecast {
    var level: String
    var days: [RiskDay]
}

struct HealthReport {
    var overallScore: Int
    var deltaPercent: Int
    var sleepRecovery: String
    var stressLevel: String
    var advice: String
}
