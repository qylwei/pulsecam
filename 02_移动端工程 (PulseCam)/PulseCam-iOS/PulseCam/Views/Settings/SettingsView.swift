import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var pdfData: Data?

    var body: some View {
        NavigationStack {
            @Bindable var app = app
            ScrollView {
                VStack(spacing: 16) {
                    lightSection(app: app)
                    aboutPanel(app: app)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 30)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("设置")
            .task { pdfData = PDFReportGenerator.generate(history: app.history, snapshots: app.snapshots) }
        }
    }

    // MARK: - Light section

    private func lightSection(app: Bindable<AppModel>) -> some View {
        VStack(spacing: 0) {
            row(icon: "slider.horizontal.3", name: "模拟数据模式", desc: "无相机环境端到端演示", isOn: $app.isSimulation)
            Divider().padding(.leading, 62)
            HStack {
                iconBox("book.fill", Theme.sageLight, Theme.sageDark)
                Text("当前情景").font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.ink)
                Spacer()
                Text(app.scenario.rawValue).font(.system(size: 12)).foregroundStyle(Theme.inkTertiary)
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
        }
        .cardStyle()
    }

    private func aboutPanel(app: Bindable<AppModel>) -> some View {
        VStack(spacing: 0) {
            HStack {
                iconBox("lock.shield.fill", Theme.sageLight, Theme.sageDark)
                Text("数据处理").font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.ink)
                Spacer()
                Text("全部端侧 · 不上传").font(.system(size: 12)).foregroundStyle(Theme.inkTertiary)
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
            Divider().padding(.leading, 62)
            HStack {
                iconBox("heart.text.square.fill", Theme.goldLight, Theme.goldDark)
                Text("HealthKit 状态").font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.ink)
                Spacer()
                Text(app.healthKit.isAuthorized ? "已授权" : "未授权").font(.system(size: 12))
                    .foregroundStyle(app.healthKit.isAuthorized ? Theme.sageDark : Theme.inkTertiary)
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
            .onTapGesture { app.ensureAuthorization() }
            Divider().padding(.leading, 62)
            HStack {
                iconBox("info.circle.fill", Theme.fogBlueLight, Theme.fogBlueDark)
                Text("版本").font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.ink)
                Spacer()
                Text("1.0.0").font(.system(size: 12)).foregroundStyle(Theme.inkTertiary)
            }
            .padding(.horizontal, 16).padding(.vertical, 13)
        }
        .cardStyle()
    }

    private func iconBox(_ name: String, _ bg: Color, _ fg: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: 13))
            .foregroundStyle(fg)
            .frame(width: 30, height: 30)
            .background(bg, in: RoundedRectangle(cornerRadius: 9))
    }

    private func row(icon: String, name: String, desc: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 11) {
            iconBox(icon, Theme.sageLight, Theme.sageDark)
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.system(size: 13.5, weight: .medium)).foregroundStyle(Theme.ink)
                Text(desc).font(.system(size: 11)).foregroundStyle(Theme.inkTertiary)
            }
            Spacer()
            Toggle("", isOn: isOn).labelsHidden().tint(Theme.sageDark)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    // MARK: - Apple panel

    private func applePanel(app: Bindable<AppModel>) -> some View {
        darkPanel(title: "APPLE 生态联动", ledText: "SYNCED") {
            darkToggle(icon: "shield.fill", name: "Apple Health 全数据同步", desc: "HR · HRV · SLEEP · MOTION", isOn: $app.healthKitSync)
            darkToggle(icon: "applewatch", name: "Apple Watch 数据融合", desc: "手表端实时心率融合分析", isOn: $app.appleWatchSync)
            darkToggle(icon: "mic.fill", name: "Siri 快捷测量指令", desc: "\"嘿 Siri，开始健康检测\"", isOn: $app.siriShortcutEnabled)
        }
    }

    // MARK: - Live panel

    private func livePanel(app: Bindable<AppModel>) -> some View {
        darkPanel(title: "实时与桌面组件", ledText: "LIVE") {
            darkToggle(icon: "waveform.path.ecg", name: "Live Activities 实时测量", desc: "锁屏 / 灵动岛实时心率显示", isOn: $app.liveActivityEnabled)
            VStack(alignment: .leading, spacing: 12) {
                darkToggle(icon: "square.grid.2x2.fill", name: "Widget 桌面组件", desc: "今日恢复指数 · 快捷测量入口", isOn: $app.widgetEnabled)
                HStack(spacing: 8) {
                    widgetThumb(title: "RECOVERY", value: "\(app.today?.recoveryScore ?? 92)", sub: "Excellent")
                    widgetThumb(title: "HEART RATE", value: "\(Int(app.latestSnapshot?.heartRate ?? 72))", sub: "bpm · Resting")
                }
            }
            .padding(.horizontal, 18).padding(.bottom, 14)
            standbyPreview
        }
    }

    private var standbyPreview: some View {
        VStack(spacing: 6) {
            Text("23:45").font(.system(size: 32, weight: .light, design: .monospaced)).tracking(3).foregroundStyle(.white)
            Text("恢复中 · 预计明早 \(min(100, (app.today?.recoveryScore ?? 86) + 2))").font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.sage)
            Text("STANDBY · 夜间恢复卡片").font(.system(size: 9.5)).tracking(1).foregroundStyle(.white.opacity(0.32))
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(LinearGradient(colors: [Color(hex: 0x14171A), Color(hex: 0x1E2226)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.06), lineWidth: 1))
        .padding(.horizontal, 16).padding(.bottom, 10)
    }

    private func widgetThumb(title: String, value: String, sub: String) -> some View {
        VStack(spacing: 5) {
            Text(title).font(.system(size: 9.5, weight: .semibold)).tracking(1).foregroundStyle(Color(hex: 0x8B9090))
            Text(value).font(.system(size: 24, weight: .light, design: .monospaced)).foregroundStyle(Color(hex: 0xEDEEEE))
            Text(sub).font(.system(size: 9.5)).foregroundStyle(Color(hex: 0x8B9090))
        }
        .frame(width: 128)
        .padding(12)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 15))
        .overlay(RoundedRectangle(cornerRadius: 15).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    // MARK: - Alert panel

    private func alertPanel(app: Bindable<AppModel>) -> some View {
        darkPanel(title: "数据与预警", ledText: "2 ACTIVE", ledColor: Theme.gold) {
            darkSlider(icon: "waveform.path.ecg", name: "心率上限预警",
                       value: $app.hrAlertThreshold, range: 60...140, step: 1,
                       format: { "\(Int($0)) bpm" })
            darkSlider(icon: "brain.head.profile", name: "压力指数预警",
                       value: $app.stressAlertThreshold, range: 1...5, step: 0.5,
                       format: { String(format: "%.1f", $0) })
            HStack {
                iconBoxDark("square.and.arrow.down")
                Text("数据导出").font(.system(size: 13.5, weight: .medium)).foregroundStyle(Color(hex: 0xEDEEEE))
                Text("周报 PDF / CSV 格式").font(.system(size: 11)).foregroundStyle(Color(hex: 0x8B9090))
                Spacer()
                if let data = pdfData {
                    ShareLink(item: data, preview: SharePreview("PulseCam 健康周报")) {
                        Text("导出").font(.system(size: 12)).foregroundStyle(Color(hex: 0xA9AEAE))
                    }
                }
                Text("›").foregroundStyle(Color(hex: 0x5B5F5F))
            }
            .padding(.horizontal, 18).padding(.vertical, 13)
            HStack {
                iconBoxDark("slider.horizontal.3")
                Text("情景模式自定义").font(.system(size: 13.5, weight: .medium)).foregroundStyle(Color(hex: 0xEDEEEE))
                Text("管理测量情景与专属 AI 建议偏好").font(.system(size: 11)).foregroundStyle(Color(hex: 0x8B9090))
                Spacer()
                Text("配置").font(.system(size: 12)).foregroundStyle(Color(hex: 0xA9AEAE))
                Text("›").foregroundStyle(Color(hex: 0x5B5F5F))
            }
            .padding(.horizontal, 18).padding(.vertical, 13)
        }
    }

    private func darkSlider(icon: String, name: String, value: Binding<Double>, range: ClosedRange<Double>, step: Double, format: @escaping (Double) -> String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: icon).font(.system(size: 12)).foregroundStyle(Color(hex: 0xDADDDD))
                Text(name).font(.system(size: 12, weight: .medium)).foregroundStyle(Color(hex: 0xDADDDD))
                Spacer()
                Text(format(value.wrappedValue)).font(.system(size: 12, weight: .semibold, design: .monospaced)).foregroundStyle(Theme.gold)
            }
            Slider(value: value, in: range, step: step)
                .tint(Theme.gold)
                .padding(.vertical, 2)
        }
        .padding(.horizontal, 18).padding(.vertical, 8)
    }

    private func darkToggle(icon: String, name: String, desc: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 11) {
            iconBoxDark(icon)
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.system(size: 13.5, weight: .medium)).foregroundStyle(Color(hex: 0xEDEEEE))
                Text(desc).font(.system(size: 11, design: .monospaced)).foregroundStyle(Color(hex: 0x8B9090))
            }
            Spacer()
            DarkToggle(isOn: isOn)
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
    }

    private func iconBoxDark(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 13))
            .foregroundStyle(Color(hex: 0xC7CBCB))
            .frame(width: 30, height: 30)
            .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.white.opacity(0.06), lineWidth: 1))
    }

    private func darkPanel(title: String, ledText: String, ledColor: Color = Theme.sage, @ViewBuilder content: () -> some View) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                    .tracking(2)
                    .foregroundStyle(Color(hex: 0x9AA0A0))
                Spacer()
                HStack(spacing: 5) {
                    Circle().fill(ledColor).frame(width: 5, height: 5).shadow(color: ledColor.opacity(0.7), radius: 3)
                    Text(ledText).font(.system(size: 9.5)).foregroundStyle(Theme.sage)
                }
            }
            .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 10)
            content()
        }
        .darkPanelStyle()
    }
}

// MARK: - Dark toggle

struct DarkToggle: View {
    @Binding var isOn: Bool
    var body: some View {
        Button {
            isOn.toggle()
        } label: {
            RoundedRectangle(cornerRadius: 13)
                .fill(isOn ? Theme.sageDark : Color(hex: 0x45484A))
                .frame(width: 42, height: 24)
                .overlay(alignment: .leading) {
                    Circle()
                        .fill(isOn ? Color.white : Color(hex: 0xEDEEEE))
                        .frame(width: 18, height: 18)
                        .padding(2)
                        .offset(x: isOn ? 18 : 0)
                        .animation(.easeInOut(duration: 0.25), value: isOn)
                }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Pro card

struct ProCard: View {
    @Environment(AppModel.self) private var app
    @State private var showPro = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("PULSECAM PRO")
                .font(.system(size: 9, weight: .bold))
                .tracking(2)
                .opacity(0.6)
            HStack(alignment: .center) {
                Text("P").font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Color.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text("升级 PulseCam Pro").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                    Text("解锁 AI 健康助手 · HRV 报告 · 趋势分析 · PDF 周报")
                        .font(.system(size: 9)).opacity(0.7).foregroundStyle(.white)
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("¥18").font(.system(size: 22, weight: .bold, design: .monospaced)).foregroundStyle(.white)
                    Text("/月").font(.system(size: 10, weight: .medium)).opacity(0.6).foregroundStyle(.white)
                }
            }
            HStack(spacing: 4) {
                proCheck("AI 健康助手（端侧推理）", on: true)
                proCheck("HRV 时域+频域完整报告", on: true)
                proCheck("7天/30天趋势分析", on: true)
                proCheck("Apple Health 全同步", on: false)
                proCheck("情景模式 ×5", on: false)
            }
            Button {
                showPro = true
            } label: {
                Text(app.isPro ? "已订阅 ✓" : "立即升级 · 免费试用 7 天")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.sageDark)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                    .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)
            }
            Text("基础心率监测永久免费")
                .font(.system(size: 8.5))
                .opacity(0.4)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
        }
        .padding(18)
        .background(LinearGradient(colors: [Theme.sageDark, Theme.sage],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.15), lineWidth: 1))
        .shadow(color: Theme.sageDark.opacity(0.25), radius: 16, x: 0, y: 6)
        .sheet(isPresented: $showPro) { ProUpgradeView() }
    }

    private func proCheck(_ text: String, on: Bool) -> some View {
        Text("\(on ? "✓" : "○") \(text)")
            .font(.system(size: 9, weight: .medium))
            .foregroundStyle(on ? Color.white.opacity(0.9) : Color.white.opacity(0.45))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Color.white.opacity(on ? 0.1 : 0.05), in: RoundedRectangle(cornerRadius: 6))
    }
}
