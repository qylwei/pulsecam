import SwiftUI

/// 情景分段条：选中项雾蓝底色 + 底部下划线。
struct ScenarioPickerView: View {
    @Binding var scenario: Scenario

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Scenario.allCases) { s in
                Button {
                    scenario = s
                } label: {
                    Text(s.rawValue)
                        .font(.system(size: 12, weight: scenario == s ? .semibold : .regular))
                        .foregroundStyle(scenario == s ? Theme.ink : Theme.inkTertiary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(scenario == s ? Theme.fogBlueLight : .clear)
                        .overlay(alignment: .bottom) {
                            if scenario == s {
                                Capsule().fill(Theme.fogBlueDark).frame(height: 2).padding(.horizontal, 12)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.lineSoft, lineWidth: 1))
    }
}
