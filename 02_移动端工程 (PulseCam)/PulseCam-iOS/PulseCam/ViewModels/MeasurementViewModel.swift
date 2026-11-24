import SwiftUI
import ActivityKit
import Observation

@Observable
final class MeasurementViewModel {
    enum Phase {
        case idle
        case measuring
        case done
        case error
    }

    let engine = MeasurementEngine()
    var phase: Phase = .idle
    var result: PPGResult?
    var finalSnapshot: HealthSnapshot?
    var scenario: Scenario = .daily
    var isSimulation = false
    var showAnalysis = false

    private weak var store: LocalStore?
    private weak var healthKit: HealthKitManager?
    private var finishTimer: Timer?

    func attach(store: LocalStore, healthKit: HealthKitManager) {
        self.store = store
        self.healthKit = healthKit
        engine.onAutoFinish = { [weak self] r in
            self?.handleResult(r)
        }
    }

    func start(scenario: Scenario, simulation: Bool) {
        self.scenario = scenario
        self.isSimulation = simulation
        phase = .measuring
        result = nil
        finalSnapshot = nil
        if simulation {
            engine.startSimulation(heartRate: Double.random(in: 62...80))
        } else {
            engine.start()
        }
        finishTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self else { return }
            if self.engine.progress >= 1 {
                self.finishTimer?.invalidate()
                self.finishTimer = nil
                self.finish()
            }
        }
    }

    func cancel() {
        _ = engine.finish()
        finishTimer?.invalidate()
        finishTimer = nil
        phase = .idle
    }

    func finish() {
        guard let r = engine.finish() ?? result else {
            phase = .error
            return
        }
        handleResult(r)
    }

    func reset() {
        cancel()
        result = nil
        finalSnapshot = nil
        showAnalysis = false
    }

    func toggleAnalysis() {
        showAnalysis.toggle()
    }

    private func handleResult(_ r: PPGResult) {
        guard phase == .measuring else { return }
        result = r
        let snapshot = buildSnapshot(from: r)
        finalSnapshot = snapshot
        if !isSimulation { store?.addSnapshot(snapshot) }
        if !isSimulation, let healthKit, let store, store.settings.healthKitSync {
            healthKit.write(snapshot: snapshot)
        }
        phase = .done
    }

    private func buildSnapshot(from r: PPGResult) -> HealthSnapshot {
        let stress = stressIndex(hrv: r.hrv, hr: r.heartRate)
        let recovery = recoveryScore(hrv: r.hrv, stress: stress, quality: r.quality)
        return HealthSnapshot(date: Date(),
                              scenario: scenario,
                              heartRate: r.heartRate,
                              hrvSDNN: r.hrv?.sdnn ?? 0,
                              respiratoryRate: r.respiratoryRate,
                              stressIndex: stress,
                              recoveryScore: recovery,
                              sleepHours: nil,
                              quality: r.quality)
    }

    /// 非医疗用途的压力参考值：短时 RMSSD 与心率构成的启发式指标。
    private func stressIndex(hrv: HRVMetrics?, hr: Double) -> Double {
        let hrvComp: Double
        if let hrv, hrv.rmssd > 0 {
            hrvComp = max(0, min(1, 1 - hrv.rmssd / 80))
        } else {
            hrvComp = 0.4
        }
        let hrComp = max(0, min(1, (hr - 55) / 45))
        return min(100, max(0, (hrvComp * 0.6 + hrComp * 0.4) * 100))
    }

    /// 核心恢复指数 0-100：HRV 水平 + 压力互补项，乘信号质量。
    private func recoveryScore(hrv: HRVMetrics?, stress: Double, quality: Double) -> Int {
        let hrvScore: Double
        if let hrv {
            hrvScore = max(0, min(1, hrv.sdnn / 80))
        } else {
            hrvScore = 0.6
        }
        let base = (hrvScore * 0.55 + (1 - stress / 100) * 0.45) * 100
        let q = max(0.5, Double(quality))
        return Int((base * q).rounded())
    }
}

/// Live Activities 状态更新（灵动岛 / 锁屏）。
enum LiveActivityManager {
    static func start(scenario: Scenario) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attrs = MeasurementAttributes(scenarioName: scenario.rawValue)
        let state = MeasurementAttributes.ContentState(heartRate: 0, progress: 0, recoveryScore: nil)
        _ = try? Activity.request(attributes: attrs, contentState: state, pushType: nil)
    }

    static func update(heartRate: Int, progress: Double, recoveryScore: Int?) {
        let state = MeasurementAttributes.ContentState(heartRate: heartRate, progress: progress, recoveryScore: recoveryScore)
        for activity in Activity<MeasurementAttributes>.activities {
            Task { try? await activity.update(using: state) }
        }
    }

    static func end(recoveryScore: Int) {
        let state = MeasurementAttributes.ContentState(heartRate: 0, progress: 1, recoveryScore: recoveryScore)
        for activity in Activity<MeasurementAttributes>.activities {
            Task { await activity.end(using: state, dismissalPolicy: .after(Date().addingTimeInterval(10))) }
        }
    }
}
