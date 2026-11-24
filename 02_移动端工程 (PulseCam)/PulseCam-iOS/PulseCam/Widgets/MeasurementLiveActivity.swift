import SwiftUI
import WidgetKit
import ActivityKit

/// Live Activity 渲染（锁屏 / 灵动岛）。
/// 注：要让灵动岛/锁屏真正生效，需要把本文件与同目录 Widget 移到独立 Widget Extension 目标，
/// 并在 `@main WidgetBundle` 中注册。放在主 App 目标内可编译但不会注册。
struct MeasurementLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MeasurementAttributes.self) { context in
            LockScreenView(state: context.state, scenarioName: context.attributes.scenarioName)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading) {
                        Text("PulseCam").font(.caption2).foregroundStyle(.secondary)
                        Text("\(context.state.heartRate) bpm").font(.headline)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.recoveryScore.map { "\($0)" } ?? "…")
                        .font(.headline)
                        .foregroundStyle(.green)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(value: context.state.progress)
                        .tint(.green)
                }
            } compactLeading: {
                Text("\(context.state.heartRate)").font(.headline).monospacedDigit()
            } compactTrailing: {
                Image(systemName: "heart.fill").foregroundStyle(.red)
            } minimal: {
                Image(systemName: "heart.fill").foregroundStyle(.red)
            }
        }
    }

    private func LockScreenView(state: MeasurementAttributes.ContentState, scenarioName: String) -> some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading) {
                Text("PulseCam · \(scenarioName)").font(.caption).foregroundStyle(.secondary)
                Text("\(state.heartRate) bpm").font(.largeTitle.bold()).monospacedDigit()
            }
            Spacer()
            VStack(alignment: .trailing) {
                if let score = state.recoveryScore {
                    Text("恢复").font(.caption2).foregroundStyle(.secondary)
                    Text("\(score)").font(.title.bold()).foregroundStyle(.green)
                } else {
                    Image(systemName: "waveform.path.ecg")
                        .font(.title)
                        .symbolEffect(.pulse)
                        .foregroundStyle(.green)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
    }
}
