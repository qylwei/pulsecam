import SwiftUI
import WidgetKit

struct RecoveryEntry: TimelineEntry {
    let date: Date
    let score: Int
    let hrv: Int
    let trend: [Int]
}

struct RecoveryProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecoveryEntry {
        RecoveryEntry(date: .now, score: 88, hrv: 46, trend: [82, 85, 84, 87, 86, 88])
    }

    func getSnapshot(in context: Context, completion: @escaping (RecoveryEntry) -> Void) {
        completion(load())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RecoveryEntry>) -> Void) {
        let entry = load()
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func load() -> RecoveryEntry {
        let defaults = UserDefaults(suiteName: Constants.appGroup)
        let history = (try? JSONDecoder().decode([DailyHealthPoint].self,
                                                 from: Data(defaults?.data(forKey: Constants.suiteKeys.history) ?? Data()))) ?? []
        let latest = history.sorted { $0.date > $1.date }.first
        return RecoveryEntry(date: .now,
                             score: latest?.recoveryScore ?? 88,
                             hrv: Int(latest?.hrvSDNN ?? 46),
                             trend: history.sorted { $0.date < $1.date }.suffix(14).map { $0.recoveryScore })
    }
}

struct PulseCamWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: RecoveryEntry

    var body: some View {
        HStack {
            if family == .systemSmall {
                VStack(alignment: .leading, spacing: 6) {
                    compactHeader
                    Spacer()
                    scoreText
                    Spacer()
                    Label("\(entry.hrv)ms", systemImage: "waveform.path.ecg")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    compactHeader
                    HStack {
                        scoreText
                        Spacer()
                        ChartView(values: entry.trend.isEmpty ? [entry.score] : entry.trend)
                            .frame(width: 140, height: 56)
                    }
                }
            }
        }
        .padding(12)
    }

    private var compactHeader: some View {
        HStack(spacing: 4) {
            Image(systemName: "heart.fill").font(.caption2).foregroundStyle(Theme.accent)
            Text("PulseCam").font(.caption2.weight(.semibold)).foregroundStyle(Theme.inkSecondary)
            Spacer()
        }
    }

    private var scoreText: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(entry.score)").font(.metric(34, weight: .bold)).foregroundStyle(Theme.ink)
            Text("RECOVERY").font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(Theme.inkTertiary)
        }
    }
}

private struct ChartView: View {
    let values: [Int]
    var body: some View {
        GeometryReader { geo in
            let minV = CGFloat(values.min() ?? 0)
            let maxV = max(CGFloat(values.max() ?? 100), minV + 1)
            let stepX = geo.size.width / CGFloat(max(values.count - 1, 1))
            let pts = values.enumerated().map { i, v in
                CGPoint(x: CGFloat(i) * stepX,
                        y: geo.size.height - CGFloat(v - minV) / (maxV - minV) * (geo.size.height - 6) - 3)
            }
            ZStack {
                if pts.count > 1 {
                    Path { p in
                        p.move(to: pts[0])
                        for pt in pts.dropFirst() { p.addLine(to: pt) }
                    }
                    .stroke(Theme.accent, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
            }
        }
    }
}

/// 主屏 Widget。
struct PulseCamWidget: Widget {
    let kind = "PulseCamWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RecoveryProvider()) { entry in
            PulseCamWidgetView(entry: entry)
                .containerBackground(for: .widget) { Theme.background }
        }
        .configurationDisplayName("恢复指数")
        .description("查看今天的核心恢复指数与 HRV。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
