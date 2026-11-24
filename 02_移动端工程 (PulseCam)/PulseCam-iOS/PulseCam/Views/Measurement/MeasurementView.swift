import SwiftUI

struct MeasurementView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        return NavigationStack {
            ZStack {
                Theme.background.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        Text("情景测量")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        ScenarioPickerView(scenario: $app.scenario)
                        switch app.measurement.phase {
                        case .idle: idleState
                        case .measuring: measuringState
                        case .done: doneState
                        case .error: errorState
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 30)
                }
            }
            .navigationTitle("测量")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if app.isSimulation {
                        Label("模拟", systemImage: "slider.horizontal.3")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.fogBlueDark)
                    }
                }
            }
        }
    }

    // MARK: - Idle

    private var idleState: some View {
        VStack(spacing: 16) {
            ZStack {
                RadialGradient(colors: [Color(hex: 0x182028), Color(hex: 0x0B0E12)],
                               center: .top, startRadius: 20, endRadius: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 22))
                VStack(spacing: 8) {
                    Image(systemName: "camera.aperture")
                        .font(.system(size: 34))
                        .foregroundStyle(Theme.sage)
                    Text("f/2.8").font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.gold.opacity(0.85))
                    Text("\(app.scenario.measurementNote)")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.75))
                    Text("30 秒同步输出心率 · 呼吸 · HRV · 恢复指数")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.5))
                }
            }
            .frame(height: 220)
            .overlay(alignment: .top) {
                HStack(spacing: 6) {
                    Circle().fill(Theme.coral).frame(width: 6, height: 6)
                    Text("前置摄像头 · 实时预览").font(.system(size: 10)).tracking(1).foregroundStyle(.white.opacity(0.7))
                }
                .padding(.horizontal, 12).padding(.vertical, 4)
                .background(.white.opacity(0.06), in: Capsule())
                .padding(.top, 12)
            }

            Button {
                app.measurement.start(scenario: app.scenario, simulation: app.isSimulation)
            } label: {
                Text("开始测量")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Theme.sageDark, in: RoundedRectangle(cornerRadius: 12))
                    .shadow(color: Theme.sageDark.opacity(0.25), radius: 10, x: 0, y: 4)
            }
            Label("所有数据本地处理 · 不上传", systemImage: "lock.shield.fill")
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkTertiary)
        }
        .padding(18)
        .cardStyle()
    }

    // MARK: - Measuring

    private var measuringState: some View {
        let vm = app.measurement
        return VStack(spacing: 12) {
            CameraPreviewView(engine: vm.engine)
                .frame(height: 330)
                .clipShape(RoundedRectangle(cornerRadius: 22))
                .overlay {
                    CameraOverlay(heartRate: vm.engine.liveHeartRate,
                                  hrv: Int(vm.engine.liveHRV))
                }

            HStack(spacing: 8) {
                WaveformView(samples: vm.engine.waveformSamples)
                    .padding(10)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 15))
                    .overlay(RoundedRectangle(cornerRadius: 15).stroke(Theme.lineSoft, lineWidth: 1))
                Text("rPPG LIVE")
                    .font(.system(size: 9.5, weight: .semibold))
                    .foregroundStyle(Theme.sageDark)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Theme.sageLight, in: RoundedRectangle(cornerRadius: 6))
            }

            HStack(spacing: 8) {
                measureMini(icon: "waveform.path.ecg", iconBg: Theme.coralLight, iconFg: Theme.coralDark,
                            value: vm.engine.liveHeartRate > 0 ? "\(vm.engine.liveHeartRate)" : "—", label: "心率 · bpm")
                measureMini(icon: "arrow.triangle.2.circlepath", iconBg: Theme.fogBlueLight, iconFg: Theme.fogBlueDark,
                            value: vm.engine.liveHRV > 0 ? "\(Int(vm.engine.liveHRV))" : "—", label: "HRV-SDNN · ms")
            }

            VStack(spacing: 8) {
                ProgressView(value: vm.engine.progress)
                    .tint(Theme.sageDark)
                HStack {
                    Text("\(Int(vm.engine.progress * Constants.measurementSeconds)) / \(Int(Constants.measurementSeconds)) 秒")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.inkSecondary)
                    Spacer()
                    Text("\(Int(vm.engine.liveConfidence * 100))% 频谱置信度")
                        .font(.system(size: 10.5))
                        .foregroundStyle(Theme.inkTertiary)
                }
            }
            .padding(14)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 15))
            .overlay(RoundedRectangle(cornerRadius: 15).stroke(Theme.lineSoft, lineWidth: 1))

            Button("取消") { vm.cancel() }
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.inkTertiary)
        }
    }

    private func measureMini(icon: String, iconBg: Color, iconFg: Color, value: String, label: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundStyle(iconFg)
                .frame(width: 30, height: 30)
                .background(iconBg, in: RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 2) {
                Text(value)
                    .font(.system(size: 21, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Theme.ink)
                Text(label).font(.system(size: 10.5)).foregroundStyle(Theme.inkTertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(13)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 15))
        .overlay(RoundedRectangle(cornerRadius: 15).stroke(Theme.lineSoft, lineWidth: 1))
    }

    // MARK: - Done

    private var doneState: some View {
        let vm = app.measurement
        return VStack(spacing: 14) {
            if let snapshot = vm.finalSnapshot {
                VStack(spacing: 4) {
                    if vm.isSimulation {
                        Text("模拟数据 · 不保存至健康记录")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.warning)
                    }
                    Text("测量完成 · 核心恢复指数")
                        .font(.system(size: 12, weight: .semibold))
                        .tracking(1)
                        .foregroundStyle(Theme.inkTertiary)
                    Text("\(snapshot.recoveryScore)")
                        .font(.system(size: 52, weight: .light, design: .default))
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink)
                        .padding(.vertical, 4)
                    Text("\(RecoveryLevel.level(for: snapshot.recoveryScore).rawValue) · 适合当前情景")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.inkSecondary)
                }
                .padding(.vertical, 6)

                HStack(spacing: 8) {
                    metricSmall(label: "心率", value: "\(Int(snapshot.heartRate)) bpm")
                    metricSmall(label: "HRV-SDNN", value: snapshot.hrvSDNN > 0 ? "\(Int(snapshot.hrvSDNN)) ms" : "—")
                    metricSmall(label: "呼吸", value: snapshot.respiratoryRate > 0 ? "\(Int(snapshot.respiratoryRate)) 次/分" : "—")
                }

                Button {
                    withAnimation { vm.toggleAnalysis() }
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "brain.head.profile").font(.system(size: 12))
                        Text("分析依据").font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(Theme.inkSecondary)
                    .padding(.horizontal, 18).padding(.vertical, 7)
                    .background(Theme.card, in: Capsule())
                    .overlay(Capsule().stroke(Theme.divider, lineWidth: 1))
                }

                if vm.showAnalysis {
                    Text(analysisText(snapshot))
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.ink)
                        .lineSpacing(4)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.fog, in: RoundedRectangle(cornerRadius: 10))
                        .overlay(alignment: .leading) { Rectangle().fill(Theme.gold).frame(width: 2.5).clipShape(RoundedRectangle(cornerRadius: 1)) }
                }

                scenarioAdvice(snapshot.scenario)
            } else {
                Text("未获取到有效数据，请重试").font(.footnote).foregroundStyle(Theme.inkSecondary)
            }
            Button {
                vm.reset()
            } label: {
                Text("完成")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Theme.sageDark, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(18)
        .cardStyle()
    }

    private func metricSmall(label: String, value: String) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(Theme.ink)
            Text(label).font(.system(size: 10)).foregroundStyle(Theme.inkTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(Theme.cardSecondary, in: RoundedRectangle(cornerRadius: 10))
    }

    private func scenarioAdvice(_ scenario: Scenario) -> some View {
        HStack(spacing: 11) {
            Image(systemName: scenario.symbol)
                .font(.system(size: 16))
                .foregroundStyle(Theme.lavenderDark)
                .frame(width: 34, height: 34)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 10))
                .shadow(color: Theme.shadow, radius: 4, x: 0, y: 2)
            VStack(alignment: .leading, spacing: 3) {
                Text(scenario.rawValue + "模式")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.lavenderDark)
                Text(scenario.advice)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.ink)
                    .lineSpacing(3)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.lavenderLight, in: RoundedRectangle(cornerRadius: 15))
        .overlay(RoundedRectangle(cornerRadius: 15).stroke(Theme.lavender.opacity(0.18), lineWidth: 1))
    }

    private var errorState: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(Theme.warning)
            Text("未检测到稳定面部信号")
                .font(.headline).foregroundStyle(Theme.ink)
            Text("请检查相机权限与光线，保持面部稳定后重试；无相机时可开启模拟数据模式。")
                .font(.footnote).foregroundStyle(Theme.inkTertiary)
                .multilineTextAlignment(.center)
            Button { app.measurement.reset() } label: {
                Text("返回").font(.headline).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .background(Theme.sageDark, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(24)
        .cardStyle()
    }

    private func analysisText(_ snapshot: HealthSnapshot) -> String {
        let context = AIContext(recoveryScore: snapshot.recoveryScore,
                                hrvToday: snapshot.hrvSDNN,
                                hrvBaseline: app.baselineHRV,
                                sleepTonight: nil,
                                sleepBaseline: app.baselineSleep,
                                restingHR: snapshot.heartRate,
                                stressIndex: snapshot.stressIndex,
                                scenario: snapshot.scenario,
                                history: app.history)
        let analysis = AIHealthAdvisor.hrvAnswer(context)
        return "\(analysis.explanation)\(analysis.suggestion)"
    }
}
