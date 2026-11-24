import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var app
    @State private var pdfData: Data?

    private var todayScore: Int? { app.today?.recoveryScore }

    private var hrvValue: String { app.today.map { "\(Int($0.hrvSDNN))ms" } ?? "—" }
    private var restingHRValue: String { app.latestSnapshot.map { "\(Int($0.heartRate))bpm" } ?? "—" }
    private var sleepValue: String { app.today?.sleepHours.map { String(format: "%.1fh", $0) } ?? "—" }

    private var checkedDays: Set<Date> {
        let cal = Calendar.current
        return Set(app.snapshots.map { cal.startOfDay(for: $0.date) })
    }

    private var sleepHistory: [Double] {
        app.history.sorted { $0.date < $1.date }.compactMap { $0.sleepHours }.suffix(14)
    }

    private var stressHistory: [Double] {
        app.history.sorted { $0.date < $1.date }.map { $0.stressIndex }.suffix(14)
    }

    private var sleepSeries: [Double] { Array(sleepHistory) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    heroCard
                    if todayScore != nil { stickyRow }
                    if let report = app.report {
                        HealthReportCard(report: report,
                                         sleepHistory: Array(sleepHistory),
                                         stressHistory: Array(stressHistory))
                    }
                    if todayScore != nil && app.history.count >= 3 {
                        twinCard
                    }
                    calendarCard
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 30)
            }
            .background(Theme.background)
            .navigationTitle("概览")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        if let data = pdfData {
                            ShareLink(item: data, preview: SharePreview("PulseCam 健康周报")) {
                                Image(systemName: "square.and.arrow.up")
                            }
                        }
                    }
                    .foregroundStyle(Theme.sageDark)
                }
            }
            .task {
                pdfData = PDFReportGenerator.generate(history: app.history, snapshots: app.snapshots)
            }
        }
    }

    // MARK: - Hero

    private var heroCard: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                Text("RECOVERY SCORE")
                    .font(.system(size: 10.5, weight: .medium))
                    .tracking(1.5)
                    .foregroundStyle(Theme.inkTertiary)
                Text("核心恢复指数").font(.system(size: 10.5)).foregroundStyle(Theme.inkTertiary)
                if app.recoveryDeltaWeek != 0 {
                    Text("WK \(app.recoveryDeltaWeek > 0 ? "↑" : "↓")\(abs(app.recoveryDeltaWeek))")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Theme.inkSecondary)
                        .padding(.horizontal, 10).padding(.vertical, 3)
                        .background(Theme.card.opacity(0.7), in: RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.black.opacity(0.05), lineWidth: 1))
                }
            }
            GaugeRing(score: todayScore, size: 180)
            VStack(spacing: 10) {
                HStack(spacing: 7) {
                    BreathingDot()
                    Text(todayScore.map { RecoveryLevel.level(for: $0).rawValue } ?? "完成首次记录后生成")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.sageDark)
                }
                .padding(.horizontal, 16).padding(.vertical, 6)
                .background(Theme.sageLight, in: Capsule())

                if let todayScore {
                    HStack(spacing: 8) {
                        Text("恢复稳定性").font(.system(size: 9.5, weight: .medium)).foregroundStyle(Theme.inkTertiary)
                        StabilityBar(score: todayScore)
                    }
                    .frame(maxWidth: 260)
                }

                HStack(spacing: 18) {
                    miniMetric(value: hrvValue, label: "HRV")
                    miniMetric(value: restingHRValue, label: "静息心率")
                    miniMetric(value: sleepValue, label: "睡眠")
                }
            }
        }
        .padding(22)
        .frame(maxWidth: .infinity)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 24))
        .overlay(alignment: .top) {
            Rectangle().fill(LinearGradient(colors: [.clear, .white.opacity(0.6), .clear],
                                            startPoint: .leading, endPoint: .trailing))
                .frame(height: 1)
        }
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.black.opacity(0.07), lineWidth: 1))
        .shadow(color: Theme.shadow, radius: 20, x: 0, y: 8)
    }

    private func miniMetric(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .foregroundStyle(Theme.ink)
            Text(label)
                .font(.system(size: 9.5, weight: .medium))
                .foregroundStyle(Theme.inkTertiary)
        }
    }

    // MARK: - Sticky notes

    private var stickyRow: some View {
        HStack(spacing: 12) {
            StickyNote(title: "今日适合", symbol: "leaf.fill",
                       tags: app.todayRecommended,
                       tint: Theme.sage, tintLight: Theme.sageLight, tintDark: Theme.sageDark,
                       rotation: -1.4)
            StickyNote(title: "今日谨慎", symbol: "exclamationmark.triangle.fill",
                       tags: app.todayCaution,
                       tint: Theme.coral, tintLight: Theme.coralLight, tintDark: Theme.coralDark,
                       rotation: 1.2)
        }
    }

    // MARK: - Twin

    private var twinCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 12))
                Text("基于记录的趋势外推 · 非医疗预测")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(1)
            }
            .foregroundStyle(Theme.inkTertiary)
            TwinChart(recovery: app.twinPredictions.map { Double($0.recoveryScore) },
                      sleep: sleepSeries,
                      stress: app.twinPredictions.map { Double($0.stressLevel) })
                .frame(height: 92)
            TwinLegend()
        }
        .padding(18)
        .cardStyle()
    }

    private var calendarCard: some View {
        CheckinCalendar(checkedDays: checkedDays)
            .padding(18)
            .cardStyle()
    }
}

struct BreathingDot: View {
    var color: Color = Theme.sage
    @State private var pulse = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 7, height: 7)
            .scaleEffect(pulse ? 1.7 : 1)
            .opacity(pulse ? 0.3 : 1)
            .animation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true), value: pulse)
            .onAppear { pulse = true }
    }
}
