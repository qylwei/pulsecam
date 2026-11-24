import SwiftUI
import Observation

@Observable
final class AppModel {
    let store = LocalStore()
    let healthKit = HealthKitManager()
    let storeManager = StoreManager()
    let measurement = MeasurementViewModel()

    init() {
        measurement.attach(store: store, healthKit: healthKit)
    }

    var scenario: Scenario {
        get { store.settings.scenario }
        set { store.settings.scenario = newValue }
    }

    var isSimulation: Bool {
        get { store.settings.simulationMode }
        set { store.settings.simulationMode = newValue }
    }

    var healthKitSync: Bool {
        get { store.settings.healthKitSync }
        set { store.settings.healthKitSync = newValue }
    }

    var appleWatchSync: Bool {
        get { store.settings.appleWatchSync }
        set { store.settings.appleWatchSync = newValue }
    }

    var siriShortcutEnabled: Bool {
        get { store.settings.siriShortcutEnabled }
        set { store.settings.siriShortcutEnabled = newValue }
    }

    var liveActivityEnabled: Bool {
        get { store.settings.liveActivityEnabled }
        set { store.settings.liveActivityEnabled = newValue }
    }

    var widgetEnabled: Bool {
        get { store.settings.widgetEnabled }
        set { store.settings.widgetEnabled = newValue }
    }

    var hrAlertThreshold: Double {
        get { store.settings.hrAlertThreshold }
        set { store.settings.hrAlertThreshold = newValue }
    }

    var stressAlertThreshold: Double {
        get { store.settings.stressAlertThreshold }
        set { store.settings.stressAlertThreshold = newValue }
    }

    var isPro: Bool { storeManager.isPro || store.isPro }

    var history: [DailyHealthPoint] { store.history }
    var snapshots: [HealthSnapshot] { store.snapshots }
    var today: DailyHealthPoint? { history.first { Calendar.current.isDateInToday($0.date) } }
    var latestSnapshot: HealthSnapshot? { snapshots.last { Calendar.current.isDateInToday($0.date) } }

    var weeklyTrend: [MetricTrend] {
        let sorted = history.sorted { $0.date > $1.date }
        guard let today = sorted.first else { return [] }
        let yesterday = sorted.dropFirst().first
        func delta(_ cur: Double, _ prev: Double?) -> Double { prev.map { cur - $0 } ?? 0 }
        return [
            MetricTrend(label: "HRV", value: "\(Int(today.hrvSDNN))ms",
                        delta: delta(today.hrvSDNN, yesterday?.hrvSDNN), goodWhenUp: true),
            MetricTrend(label: "压力", value: "\(Int(today.stressIndex))",
                        delta: delta(today.stressIndex, yesterday?.stressIndex), goodWhenUp: false),
            MetricTrend(label: "睡眠", value: today.sleepHours.map { String(format: "%.1fh", $0) } ?? "—",
                        delta: delta(today.sleepHours ?? 0, yesterday?.sleepHours ?? 0), goodWhenUp: true),
        ]
    }

    var recoveryDeltaWeek: Int {
        let sorted = history.sorted { $0.date > $1.date }
        guard let today = sorted.first else { return 0 }
        let weekAgo = sorted.prefix(7).last
        return weekAgo.map { today.recoveryScore - $0.recoveryScore } ?? 0
    }

    var report: HealthReport? {
        guard let today else { return nil }
        let sorted = history.sorted { $0.date > $1.date }
        let yesterday = sorted.dropFirst().first
        let deltaPct = yesterday.map {
            Int((Double(today.recoveryScore) - Double($0.recoveryScore)) / Double(max(1, $0.recoveryScore)) * 100)
        } ?? 0
        return HealthReport(overallScore: today.recoveryScore,
                            deltaPercent: deltaPct,
                            sleepRecovery: today.sleepHours.map { $0 >= 7 ? "良好" : "偏少" } ?? "未记录",
                            stressLevel: today.stressIndex <= 45 ? "偏低" : "偏高",
                            advice: AIHealthAdvisor.defaultSuggestion(context: aiContext))
    }

    var riskForecast: RiskForecast { DigitalTwinEngine.riskForecast(history: history) }

    var twinPredictions: [TwinPrediction] { DigitalTwinEngine.predictNext(days: 30, history: history) }

    var checkedInDays: Int {
        let cal = Calendar.current
        return Set(snapshots
            .filter { cal.isDate($0.date, equalTo: Date(), toGranularity: .month) }
            .map { cal.startOfDay(for: $0.date) })
            .count
    }

    var todayRecommended: [Recommendation] {
        switch today?.recoveryScore ?? 75 {
        case 85...: [.init(title: "学习", symbol: "books.vertical.fill"), .init(title: "健身", symbol: "dumbbell.fill"), .init(title: "面试", symbol: "briefcase.fill")]
        case 70..<85: [.init(title: "学习", symbol: "books.vertical.fill"), .init(title: "散步", symbol: "figure.walk")]
        case 55..<70: [.init(title: "休息", symbol: "bed.double.fill"), .init(title: "拉伸", symbol: "figure.cooldown")]
        default: [.init(title: "休息", symbol: "bed.double.fill")]
        }
    }

    var todayCaution: [Recommendation] {
        switch today?.recoveryScore ?? 75 {
        case 85...: [.init(title: "熬夜", symbol: "moon.zzz.fill"), .init(title: "高强度运动", symbol: "flame.fill")]
        case 70..<85: [.init(title: "熬夜", symbol: "moon.zzz.fill"), .init(title: "高强度运动", symbol: "flame.fill")]
        default: [.init(title: "高强度运动", symbol: "flame.fill"), .init(title: "熬夜", symbol: "moon.zzz.fill"), .init(title: "过量咖啡因", symbol: "cup.and.saucer.fill")]
        }
    }

    var aiContext: AIContext {
        AIContext(recoveryScore: today?.recoveryScore ?? 75,
                  hrvToday: today?.hrvSDNN ?? 45,
                  hrvBaseline: baselineHRV,
                  sleepTonight: today?.sleepHours,
                  sleepBaseline: baselineSleep,
                  restingHR: latestSnapshot?.heartRate ?? 62,
                  stressIndex: today?.stressIndex ?? 35,
                  scenario: scenario,
                  history: history)
    }

    var baselineHRV: Double {
        let vals = history.suffix(7).map { $0.hrvSDNN }
        return vals.isEmpty ? 45 : average(vals)
    }

    var baselineSleep: Double {
        let vals = history.suffix(7).compactMap { $0.sleepHours }
        return vals.isEmpty ? 7.3 : average(vals)
    }

    func ensureAuthorization() {
        Task { await healthKit.requestAuthorization() }
    }

    private func average(_ v: [Double]) -> Double {
        v.reduce(0, +) / Double(v.count)
    }
}
