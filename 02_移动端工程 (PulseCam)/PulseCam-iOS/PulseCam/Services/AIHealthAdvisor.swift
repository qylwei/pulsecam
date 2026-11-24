import Foundation

struct AIContext {
    var recoveryScore: Int
    var hrvToday: Double
    var hrvBaseline: Double
    var sleepTonight: Double?
    var sleepBaseline: Double
    var restingHR: Double
    var stressIndex: Double
    var scenario: Scenario
    var history: [DailyHealthPoint]
}

/// 端侧规则式健康推理引擎：意图识别 + 个人数据因果关联，生成量化解释与可执行建议。
enum AIHealthAdvisor {
    static func answer(_ question: String, context: AIContext) -> AIResponse {
        let q = question.lowercased()
        if q.contains("hrv") || q.contains("心率变异性") {
            return hrvAnswer(context)
        }
        if q.contains("睡眠") || q.contains("困") || q.contains("睡") {
            return sleepAnswer(context)
        }
        if q.contains("运动") || q.contains("健身") || q.contains("锻炼") || q.contains("跑步") || q.contains("训练") {
            return exerciseAnswer(context)
        }
        if q.contains("恢复") || q.contains("恢复指数") || q.contains("score") {
            return recoveryAnswer(context)
        }
        if q.contains("压力") || q.contains("焦虑") || q.contains("紧张") || q.contains("心率") {
            return stressAnswer(context)
        }
        return defaultAnswer(context)
    }

    static func defaultSuggestion(context: AIContext) -> String {
        switch context.recoveryScore {
        case 85...: return "下午适合高效学习，建议今晚 23 点前入睡，明天状态会更佳"
        case 70..<85: return "当前状态良好，建议完成 30 分钟轻度活动保持节奏"
        case 55..<70: return "恢复偏低，建议今晚提前 1 小时就寝并减少晚间刺激"
        default: return "恢复状态偏低，建议优先休息，必要时咨询专业意见"
        }
    }

    static func hrvAnswer(_ c: AIContext) -> AIResponse {
        let delta = c.hrvToday - c.hrvBaseline
        let isDown = delta < -1
        var reasons = [AIReason(label: "HRV", value: String(format: "%+.0fms", delta), isDown: isDown)]

        var sleepNote = ""
        if let sleep = c.sleepTonight {
            let sleepDelta = sleep - c.sleepBaseline
            let isSleepDown = sleepDelta < -0.5
            reasons.append(AIReason(label: "睡眠", value: String(format: "%+.1fh", sleepDelta), isDown: isSleepDown))
            if isDown && isSleepDown {
                sleepNote = "，与最近睡眠偏少（\(String(format: "%.1fh", sleep)) vs 基线 \(String(format: "%.1fh", c.sleepBaseline))）相关"
            }
        }

        let headline = isDown ? "为什么今天 HRV 下降了？" : (delta > 1 ? "今天 HRV 有所回升 👍" : "HRV 整体平稳")
        let explanation: String
        if isDown {
            explanation = "HRV 反映副交感神经活跃度。今天 \(String(format: "%.0fms", c.hrvToday))，较基线 \(String(format: "%.0fms", c.hrvBaseline)) 下降 \(String(format: "%.0fms", -delta))\(sleepNote)。交感神经活动偏高。"
        } else {
            explanation = "HRV 反映副交感神经活跃度。今天 \(String(format: "%.0fms", c.hrvToday))，与基线 \(String(format: "%.0fms", c.hrvBaseline)) 相当，恢复趋势良好。"
        }
        let sleepDelta = (c.sleepTonight ?? c.sleepBaseline) - c.sleepBaseline
        let weekday = Calendar.current.component(.weekday, from: Date())
        let modelPredicted = OnDeviceModel.shared.predictTomorrowHRV(hrv: c.hrvToday,
                                                                     stress: c.stressIndex,
                                                                     sleepDelta: sleepDelta,
                                                                     dayOfWeek: weekday,
                                                                     hrvTrend: hrvTrend(c.history))
        let predicted = modelPredicted ?? (isDown ? min(c.hrvBaseline, c.hrvToday + 6) : c.hrvToday)
        let suggestion = isDown
            ? "建议今晚 23:00 前入睡，睡前避免咖啡因与剧烈运动。预计明天 HRV 恢复至 \(String(format: "%.0fms", predicted))。"
            : "继续保持当前作息与运动节奏，明日状态大概率维持在 \(String(format: "%.0fms", predicted)) 上下。"
        return AIResponse(headline: headline, explanation: explanation, suggestion: suggestion, reasons: reasons, predictedHrv: predicted)
    }

    private static func sleepAnswer(_ c: AIContext) -> AIResponse {
        let sleep = c.sleepTonight ?? c.sleepBaseline
        let delta = sleep - c.sleepBaseline
        let isDown = delta < -0.5
        let reasons = [
            AIReason(label: "睡眠", value: String(format: "%.1fh", sleep), isDown: isDown),
            AIReason(label: "恢复指数", value: "\(c.recoveryScore)", isDown: c.recoveryScore < 70),
        ]
        let headline = "今晚该几点睡？"
        let explanation = "最近平均睡眠 \(String(format: "%.1fh", sleep))\(isDown ? "，较基线偏少" : "")。睡眠不足会直接压低次日 HRV 与恢复指数。"
        let suggestion = "建议今晚 23:00 前入睡，目标睡眠 ≥7 小时；睡前一小时远离屏幕，预计次日恢复指数提升 3-5 分。"
        return AIResponse(headline: headline, explanation: explanation, suggestion: suggestion, reasons: reasons, predictedHrv: nil)
    }

    private static func exerciseAnswer(_ c: AIContext) -> AIResponse {
        let recommended: String
        if c.recoveryScore >= 85 {
            recommended = "适合中等强度训练（心率 ≤ \(Int(c.restingHR + 60))bpm，45-60 分钟），推荐力量训练 › 慢跑 › 游泳。"
        } else if c.recoveryScore >= 70 {
            recommended = "适合低-中强度活动（快走、瑜伽 30-40 分钟），避免力量训练到力竭。"
        } else {
            recommended = "恢复储备不足，建议今日只做轻度拉伸或休息，优先恢复。"
        }
        let reasons = [
            AIReason(label: "恢复指数", value: "\(c.recoveryScore)", isDown: c.recoveryScore < 70),
            AIReason(label: "HRV", value: String(format: "%.0fms", c.hrvToday), isDown: c.hrvToday < c.hrvBaseline),
        ]
        return AIResponse(headline: "今天适合去健身吗？",
                          explanation: "恢复指数 \(c.recoveryScore)\(c.recoveryScore >= 70 ? "，状态良好" : "，处于低位")。",
                          suggestion: recommended, reasons: reasons, predictedHrv: nil)
    }

    private static func recoveryAnswer(_ c: AIContext) -> AIResponse {
        let level = RecoveryLevel.level(for: c.recoveryScore)
        let reasons = [
            AIReason(label: "恢复指数", value: "\(c.recoveryScore)", isDown: c.recoveryScore < 70),
            AIReason(label: "压力", value: "\(Int(c.stressIndex))", isDown: c.stressIndex > 45),
        ]
        let suggestion = c.recoveryScore >= 85
            ? "继续维持当前作息，明日可用精力充足。"
            : "建议今晚提前就寝并减少刺激，连续 2 天高质量睡眠后恢复指数可回到 80+。"
        return AIResponse(headline: "恢复指数解读",
                          explanation: "核心恢复指数 \(c.recoveryScore)（\(level.rawValue)），由 HRV、压力与睡眠综合得出。",
                          suggestion: suggestion, reasons: reasons, predictedHrv: nil)
    }

    private static func stressAnswer(_ c: AIContext) -> AIResponse {
        let high = c.stressIndex > 45
        let reasons = [
            AIReason(label: "压力指数", value: "\(Int(c.stressIndex))", isDown: high),
            AIReason(label: "静息心率", value: "\(Int(c.restingHR))bpm", isDown: c.restingHR > 75),
        ]
        let explanation = high
            ? "压力指数 \(Int(c.stressIndex))，偏高。静息心率 \(Int(c.restingHR))bpm，交感神经处于活跃状态。"
            : "压力指数 \(Int(c.stressIndex))，处于舒适区间。"
        let suggestion = high
            ? "建议现在做 2 分钟 4-7-8 呼吸（吸 4 秒、屏 7 秒、呼 8 秒），预计 10 分钟内静息心率回落 3-5bpm。"
            : "当前压力可控。如近期有面试/考试，维持规律作息即可。"
        return AIResponse(headline: "压力状态分析", explanation: explanation, suggestion: suggestion, reasons: reasons, predictedHrv: nil)
    }

    private static func defaultAnswer(_ c: AIContext) -> AIResponse {
        let suggestions = [
            "为什么今天 HRV 下降了？",
            "今天适合去健身吗？",
            "今晚该几点睡？",
            "压力状态怎么样？",
        ]
        let reasons = [
            AIReason(label: "恢复指数", value: "\(c.recoveryScore)", isDown: c.recoveryScore < 70),
            AIReason(label: "HRV", value: String(format: "%.0fms", c.hrvToday), isDown: c.hrvToday < c.hrvBaseline),
        ]
        return AIResponse(headline: "我可以帮你解读健康数据",
                          explanation: "我可以基于你的恢复指数、HRV、睡眠与压力数据做因果分析。试试这样问我：",
                          suggestion: suggestions.joined(separator: "、"),
                          reasons: reasons, predictedHrv: nil)
    }

    private static func hrvTrend(_ history: [DailyHealthPoint]) -> Double {
        let pts = history.sorted { $0.date < $1.date }.suffix(3)
        guard pts.count >= 2 else { return 0 }
        let vals = pts.map { $0.hrvSDNN }
        return (vals.last! - vals.first!) / Double(vals.count - 1)
    }
}
