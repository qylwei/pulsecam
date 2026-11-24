import SwiftUI

struct HealthReportCard: View {
    let report: HealthReport
    let sleepHistory: [Double]
    let stressHistory: [Double]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            cardLabel("今日健康报告", icon: "sparkles")
            HStack(spacing: 16) {
                MiniRing(value: report.overallScore)
                VStack(alignment: .leading, spacing: 4) {
                    Text("综合评分")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                    HStack(spacing: 4) {
                        Image(systemName: "waveform.path.ecg").font(.system(size: 11))
                        Text("\(report.deltaPercent >= 0 ? "↑" : "↓") \(abs(report.deltaPercent))% 对比昨日")
                            .font(.system(size: 11.5, weight: .medium))
                    }
                    .foregroundStyle(Theme.sageDark)
                }
                Spacer()
            }
            .padding(.vertical, 12)

            MetricRow(name: "睡眠恢复", status: report.sleepRecovery,
                      statusColor: report.sleepRecovery == "良好" ? Theme.sageDark : Theme.warning,
                      tickOn: report.sleepRecovery == "良好" ? 7 : 4,
                      tickCount: 10, spark: sleepHistory,
                      icon: "moon.fill", iconBg: Theme.sageLight, iconFg: Theme.sageDark)
            MetricRow(name: "压力水平", status: report.stressLevel,
                      statusColor: report.stressLevel == "偏低" ? Theme.sageDark : Theme.coralDark,
                      tickOn: report.stressLevel == "偏低" ? 3 : 7,
                      tickCount: 10, spark: stressHistory,
                      icon: "brain.head.profile", iconBg: Theme.goldLight, iconFg: Theme.goldDark)

            HStack(spacing: 8) {
                Image(systemName: "sparkles").font(.system(size: 12)).foregroundStyle(Theme.goldDark)
                Text(report.advice)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.ink)
                    .lineSpacing(3)
            }
            .padding(12)
            .background(Theme.sand, in: RoundedRectangle(cornerRadius: 10))
            .overlay(alignment: .leading) {
                Rectangle().fill(Theme.gold).frame(width: 2.5)
                    .clipShape(RoundedRectangle(cornerRadius: 1))
            }
            .padding(.top, 10)
        }
        .padding(18)
        .cardStyle()
    }

    private func cardLabel(_ text: String, icon: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 12))
            Text(text.uppercased())
                .font(.system(size: 11, weight: .medium))
                .tracking(1)
        }
        .foregroundStyle(Theme.inkTertiary)
        .padding(.bottom, 6)
    }
}

struct MiniRing: View {
    let value: Int
    var body: some View {
        ZStack {
            Circle().fill(Theme.cardSecondary)
            Circle()
                .trim(from: 0, to: CGFloat(value) / 100)
                .stroke(AngularGradient(colors: [Theme.gold, Theme.gold.opacity(0.6)],
                                        center: .center),
                        style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(value)")
                .font(.system(size: 18, weight: .semibold, design: .monospaced))
                .foregroundStyle(Theme.ink)
        }
        .frame(width: 68, height: 68)
    }
}

struct MetricRow: View {
    let name: String
    let status: String
    let statusColor: Color
    let tickOn: Int
    let tickCount: Int
    let spark: [Double]
    let icon: String
    let iconBg: Color
    let iconFg: Color

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundStyle(iconFg)
                .frame(width: 26, height: 26)
                .background(iconBg, in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Text(name).font(.system(size: 12.5, weight: .medium)).foregroundStyle(Theme.ink)
                    Text(status).font(.system(size: 11, weight: .semibold)).foregroundStyle(statusColor)
                }
                HStack(spacing: 2) {
                    ForEach(0..<tickCount, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(i < tickOn ? Theme.sage : Theme.lineSoft)
                            .frame(maxWidth: .infinity).frame(height: 5)
                    }
                }
            }
            Sparkline(values: spark, color: iconFg, height: 22)
                .frame(width: 52)
        }
        .padding(.vertical, 9)
    }
}
