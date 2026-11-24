import Foundation
import Observation

struct AppSettings: Codable, Equatable {
    var autoStart = true
    var simulationMode = false
    var healthKitSync = true
    var notificationsEnabled = false
    var scenario: Scenario = .daily
    var appleWatchSync = false
    var siriShortcutEnabled = false
    var liveActivityEnabled = false
    var widgetEnabled = false
    var hrAlertThreshold = 100.0
    var stressAlertThreshold = 3.0
}

@Observable
final class LocalStore {
    private let defaults: UserDefaults

    init() {
        defaults = UserDefaults(suiteName: Constants.appGroup) ?? .standard
    }

    var settings: AppSettings {
        get { (try? JSONDecoder().decode(AppSettings.self, from: defaults.data(forKey: Constants.suiteKeys.settings) ?? Data())) ?? AppSettings() }
        set { if let d = try? JSONEncoder().encode(newValue) { defaults.set(d, forKey: Constants.suiteKeys.settings) } }
    }

    var history: [DailyHealthPoint] {
        get { decode([DailyHealthPoint].self, key: Constants.suiteKeys.history) ?? [] }
        set { encode(newValue, key: Constants.suiteKeys.history) }
    }

    var snapshots: [HealthSnapshot] {
        get { decode([HealthSnapshot].self, key: Constants.suiteKeys.snapshots) ?? [] }
        set { encode(newValue, key: Constants.suiteKeys.snapshots) }
    }

    var chatHistory: [ChatMessage] {
        get { decode([ChatMessage].self, key: Constants.suiteKeys.chat) ?? [] }
        set { encode(newValue, key: Constants.suiteKeys.chat) }
    }

    var isPro: Bool {
        get { defaults.bool(forKey: Constants.suiteKeys.pro) }
        set { defaults.set(newValue, forKey: Constants.suiteKeys.pro) }
    }

    func addSnapshot(_ s: HealthSnapshot) {
        var all = snapshots
        all.append(s)
        snapshots = Array(all.suffix(200))

        var h = history
        if let idx = h.firstIndex(where: { Calendar.current.isDate($0.date, inSameDayAs: s.date) }) {
            var p = h[idx]
            p.recoveryScore = s.recoveryScore
            p.hrvSDNN = s.hrvSDNN
            p.stressIndex = s.stressIndex
            p.sleepHours = s.sleepHours ?? p.sleepHours
            h[idx] = p
        } else {
            h.append(DailyHealthPoint(date: Calendar.current.startOfDay(for: s.date),
                                      recoveryScore: s.recoveryScore,
                                      hrvSDNN: s.hrvSDNN,
                                      stressIndex: s.stressIndex,
                                      sleepHours: s.sleepHours))
        }
        history = Array(h.suffix(90))
    }

    func clearAll() {
        defaults.removeObject(forKey: Constants.suiteKeys.history)
        defaults.removeObject(forKey: Constants.suiteKeys.snapshots)
        defaults.removeObject(forKey: Constants.suiteKeys.chat)
    }

    private func decode<T: Decodable>(_ type: T.Type, key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func encode<T: Encodable>(_ value: T, key: String) {
        if let data = try? JSONEncoder().encode(value) {
            defaults.set(data, forKey: key)
        }
    }
}
