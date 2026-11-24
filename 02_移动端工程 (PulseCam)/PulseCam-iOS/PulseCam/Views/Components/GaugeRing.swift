import SwiftUI

/// 概览 Hero 仪表环：外圈稀疏刻度 + 金→绿渐变进度环 + 中心分数。
struct GaugeRing: View {
    let score: Int?
    var size: CGFloat = 180
    @State private var animated = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.lineSoft, style: StrokeStyle(lineWidth: 2, dash: [1, 17]))
                .frame(width: size - 18, height: size - 18)

            Circle()
                .trim(from: 0, to: animated ? CGFloat(score ?? 0) / 100 : 0)
                .stroke(AngularGradient(colors: [Theme.gold, Theme.gold, Theme.sage, Theme.sage],
                                        center: .center),
                        style: StrokeStyle(lineWidth: 13, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 1.1), value: animated)

            VStack(spacing: 3) {
                Text(score.map(String.init) ?? "—")
                    .font(.system(size: 52, weight: .light, design: .default))
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink)
                Text("RECOVERY")
                    .font(.system(size: 10, weight: .medium, design: .default))
                    .tracking(3)
                    .foregroundStyle(Theme.inkTertiary)
            }
        }
        .frame(width: size, height: size)
        .onAppear { animated = true }
    }
}
