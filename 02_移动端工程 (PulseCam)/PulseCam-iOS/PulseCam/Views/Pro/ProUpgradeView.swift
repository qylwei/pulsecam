import SwiftUI

struct ProUpgradeView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    private let proFeatures: [(String, String, Bool)] = [
        ("AI 健康助手（端侧推理）", "waveform.path.ecg", true),
        ("HRV 时域 + 频域完整报告", "chart.bar.fill", true),
        ("7 天 / 30 天趋势分析", "chart.line.uptrend.xyaxis", true),
        ("PDF 健康周报", "doc.text.fill", true),
        ("Apple Health 全同步", "heart.text.square.fill", false),
        ("情景模式 ×5", "square.grid.2x2.fill", false),
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 22) {
                VStack(spacing: 6) {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 42))
                        .foregroundStyle(Theme.accent)
                    Text("PulseCam Pro")
                        .font(.title2.bold())
                        .foregroundStyle(Theme.ink)
                    Text("解锁 AI 健康助手 · HRV 报告 · 趋势分析 · PDF 周报")
                        .font(.footnote)
                        .foregroundStyle(Theme.inkTertiary)
                }
                .padding(.top, 8)

                VStack(spacing: 12) {
                    ForEach(proFeatures, id: \.0) { feature in
                        HStack(spacing: 12) {
                            Image(systemName: feature.1)
                                .font(.subheadline)
                                .foregroundStyle(feature.2 ? Theme.success : Theme.inkTertiary)
                            Text(feature.0)
                                .font(.footnote)
                                .foregroundStyle(Theme.ink)
                            Spacer()
                            Image(systemName: feature.2 ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(feature.2 ? Theme.success : Theme.inkTertiary)
                        }
                    }
                }
                .padding(18)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))

                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text(Constants.proMonthlyPrice)
                        .font(.title.weight(.bold))
                        .foregroundStyle(Theme.ink)
                    Text("/月").font(.footnote).foregroundStyle(Theme.inkTertiary)
                    Spacer()
                    Text("基础心率监测永久免费")
                        .font(.caption2)
                        .foregroundStyle(Theme.inkTertiary)
                }
                .padding(.horizontal, 4)

                Button {
                    Task { await app.storeManager.purchase(); dismiss() }
                } label: {
                    if app.storeManager.isLoading {
                        ProgressView().tint(.white)
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                    } else {
                        Text(app.isPro ? "已订阅 ✓" : "立即升级 · 免费试用 7 天")
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                    }
                }
                .background(app.isPro ? Theme.success : Theme.accent, in: RoundedRectangle(cornerRadius: 14))
                .disabled(app.isPro)

                Button("恢复购买") {
                    Task { await app.storeManager.restore() }
                }
                .font(.footnote)
                .foregroundStyle(Theme.inkSecondary)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 22)
            .padding(.bottom, 20)
            .background(Theme.background)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("关闭") { dismiss() }
                }
            }
        }
    }
}
