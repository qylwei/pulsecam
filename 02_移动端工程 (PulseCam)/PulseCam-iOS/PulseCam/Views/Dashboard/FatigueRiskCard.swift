import SwiftUI

struct FatigueRiskCard: View {
    let forecast: RiskForecast

    private var bigPercent: Int { forecast.days.first?.riskPercent ?? 18 }
    private var levelColor: Color {
        switch forecast.level {
        case "低风险": Theme.sageDark
        case "中风险": Theme.goldDark
        default: Theme.coralDark
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle")
                    Text("3天疲劳风险预测")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1)
                }
                .foregroundStyle(Theme.inkTertiary)
                Spacer()
                Text(forecast.level)
                    .font(.system(size: 10.5, weight: .bold))
                    .foregroundStyle(levelColor)
                    .padding(.horizontal, 12).padding(.vertical, 4)
                    .background(Theme.sageLight, in: Capsule())
            }
            .padding(14)
            .overlay(alignment: .bottom) { Rectangle().fill(Theme.divider.opacity(0.5)).frame(height: 0.5).padding(.horizontal, 18) }

            HStack(alignment: .center, spacing: 18) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("\(bigPercent)")
                            .font(.system(size: 38, weight: .light, design: .monospaced))
                            .foregroundStyle(Theme.ink)
                        Text("%").font(.system(size: 13)).foregroundStyle(Theme.inkTertiary)
                    }
                    Text("疲劳风险").font(.system(size: 10)).foregroundStyle(Theme.inkTertiary)
                }
                Sparkline(values: forecast.days.map { Double($0.riskPercent) }, color: Theme.coral, height: 42)
                    .frame(height: 56)
            }
            .padding(.horizontal, 18).padding(.vertical, 14)

            VStack(spacing: 0) {
                ForEach(forecast.days) { day in
                    HStack(spacing: 10) {
                        Text(day.title)
                            .font(.system(size: 11.5, design: .monospaced))
                            .foregroundStyle(Theme.inkTertiary)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Theme.lineSoft)
                                Capsule().fill(barColor(day.riskPercent))
                                    .frame(width: geo.size.width * CGFloat(day.riskPercent) / 100)
                            }
                        }
                        .frame(height: 4)
                        Text("\(day.riskPercent)%")
                            .font(.system(size: 11.5, weight: .medium, design: .monospaced))
                            .foregroundStyle(Theme.ink)
                            .frame(width: 34, alignment: .trailing)
                    }
                    .padding(.vertical, 7)
                }
            }
            .padding(.horizontal, 18)

            Text(forecast.level == "低风险"
                 ? "最近恢复指数稳定，无需调整计划。继续保持当前作息节奏。"
                 : "疲劳风险上升，建议降低未来 3 天的训练强度并保证睡眠。")
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.inkSecondary)
                .lineSpacing(3)
                .padding(12)
                .background(Theme.fog, in: RoundedRectangle(cornerRadius: 10))
                .padding(14)
        }
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(Theme.lineSoft, lineWidth: 1))
        .shadow(color: Theme.shadow, radius: 12, x: 0, y: 4)
    }

    private func barColor(_ pct: Int) -> Color {
        switch pct {
        case ..<30: Theme.sage
        case ..<55: Theme.gold
        default: Theme.coral
        }
    }
}
