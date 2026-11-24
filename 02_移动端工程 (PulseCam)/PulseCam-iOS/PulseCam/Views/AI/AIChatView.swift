import SwiftUI

struct AIChatView: View {
    @Environment(AppModel.self) private var app
    @State private var messages: [ChatMessage] = []
    @State private var input = ""
    @State private var isTyping = false
    @State private var showPro = false
    @State private var speech = SpeechRecognizer()

    private let suggestions = ["为什么今天 HRV 下降了？", "今天适合去健身吗？", "今晚该几点睡？", "压力状态怎么样？"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            dayDivider
                            ForEach(messages) { msg in
                                MessageBubble(message: msg)
                            }
                            if isTyping {
                                HStack(spacing: 9) {
                                    aiAvatar
                                    TypingIndicator()
                                        .padding(14)
                                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
                                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.lineSoft, lineWidth: 1))
                                    Spacer()
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                    }
                    .onChange(of: messages.count) { _, _ in
                        if let last = messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
                if messages.count <= 1 {
                    suggestionChips
                }
                inputBar
            }
            .background(Theme.background)
            .navigationTitle("专属健康 AI")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showPro = true } label: {
                        Label("PulseCam Pro", systemImage: "crown.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.sageDark)
                    }
                }
            }
            .sheet(isPresented: $showPro) { ProUpgradeView() }
            .onAppear {
                loadHistory()
                Task { await speech.requestAuthorization() }
            }
            .task { await app.storeManager.load() }
            .onChange(of: speech.latestTranscript) { _, text in
                if let text { send(text) }
            }
        }
    }

    private var header: some View {
        VStack(spacing: 4) {
            Text("专属健康 AI")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Theme.ink)
            HStack(spacing: 5) {
                Image(systemName: "shield.fill").font(.system(size: 11))
                Text("端侧运行 · 所有数据本地处理")
                    .font(.system(size: 11.5))
            }
            .foregroundStyle(Theme.inkTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    private var dayDivider: some View {
        Text("今天 \(Date.now, format: .dateTime.hour().minute())")
            .font(.system(size: 10.5))
            .foregroundStyle(Theme.inkTertiary)
            .padding(.vertical, 2)
    }

    private var aiAvatar: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9)
                .fill(LinearGradient(colors: [Theme.ink, Color(hex: 0x3E3D38)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 26, height: 26)
            Image(systemName: "sparkles").font(.system(size: 11)).foregroundStyle(.white)
        }
        .overlay(alignment: .topTrailing) {
            Circle().fill(Theme.sage).frame(width: 6, height: 6)
                .overlay(Circle().stroke(Theme.card, lineWidth: 2))
                .offset(x: 1, y: -1)
        }
    }

    private var suggestionChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions, id: \.self) { s in
                    Button(s) { send(s) }
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.inkSecondary)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Theme.card, in: Capsule())
                        .overlay(Capsule().stroke(Theme.lineSoft, lineWidth: 1))
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    private var inputBar: some View {
        VStack(spacing: 8) {
            HStack(spacing: 7) {
                Image(systemName: "mic.fill").font(.system(size: 13))
                Text(speech.isListening ? "松开发送 · 正在聆听…" : "按住说话")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundStyle(speech.isListening ? Theme.sageDark : Theme.inkSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(Theme.card, in: Capsule())
            .overlay(Capsule().stroke(Theme.divider, lineWidth: 1))
            .contentShape(Rectangle())
            .onLongPressGesture(minimumDuration: 0.15) {
                stopListening()
            } onPressingChanged: { pressing in
                if pressing {
                    startListening()
                } else {
                    stopListening()
                }
            }

            HStack(spacing: 8) {
                TextField("输入健康问题…", text: $input)
                    .font(.system(size: 13))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Theme.card, in: Capsule())
                    .overlay(Capsule().stroke(Theme.divider, lineWidth: 1))
                    .submitLabel(.send)
                    .onSubmit { send(input) }
                Button {
                    send(input)
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(Theme.ink, in: Circle())
                }
                .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            HStack(spacing: 5) {
                Image(systemName: "shield.fill").font(.system(size: 10))
                Text("所有回答仅基于个人健康数据 · 端侧运行")
                    .font(.system(size: 10))
            }
            .foregroundStyle(Theme.inkTertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.cardSecondary.opacity(0.5))
    }

    private func startListening() {
        guard speech.isAuthorized else {
            Task { await speech.requestAuthorization() }
            return
        }
        speech.start()
    }

    private func stopListening() {
        speech.stop()
        // 语音结果通过 onChange(of: speech.onTranscript) 自动发送
    }

    private func loadHistory() {
        if messages.isEmpty {
            messages = app.store.chatHistory
            if messages.isEmpty {
                messages = [ChatMessage(role: .assistant,
                                        text: "我是你的专属健康 AI，端侧运行、数据不出设备。可以问我：为什么今天 HRV 下降了、今天适合健身吗、今晚该几点睡。",
                                        date: Date())]
            }
        }
    }

    private func send(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        input = ""
        messages.append(ChatMessage(role: .user, text: text, date: Date()))
        isTyping = true
        let context = app.aiContext
        let reply = AIHealthAdvisor.answer(text, context: context)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
            isTyping = false
            var full = "\(reply.headline)\n\n\(reply.explanation)\n\n\(reply.suggestion)"
            if reply.reasons.isEmpty == false {
                full += "\n\n依据：" + reply.reasons.map { "\($0.label) \($0.value)" }.joined(separator: " · ")
            }
            messages.append(ChatMessage(role: .assistant, text: full, date: Date(), reasons: reply.reasons))
            app.store.chatHistory = Array(messages.suffix(60))
        }
    }
}

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .bottom, spacing: 9) {
            if message.role == .assistant {
                aiAvatar
                aiBubble
                Spacer(minLength: 40)
            } else {
                Spacer(minLength: 40)
                userBubble
            }
        }
    }

    private var aiAvatar: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 9)
                .fill(LinearGradient(colors: [Theme.ink, Color(hex: 0x3E3D38)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 26, height: 26)
            Image(systemName: "sparkles").font(.system(size: 11)).foregroundStyle(.white)
        }
        .overlay(alignment: .topTrailing) {
            Circle().fill(Theme.sage).frame(width: 6, height: 6)
                .overlay(Circle().stroke(Theme.card, lineWidth: 2))
                .offset(x: 1, y: -1)
        }
    }

    private var aiBubble: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message.text)
                .font(.system(size: 13))
                .foregroundStyle(Theme.ink)
                .lineSpacing(4)
            if !message.reasons.isEmpty {
                HStack(spacing: 5) {
                    ForEach(message.reasons, id: \.label) { r in
                        chip(r)
                    }
                }
            }
            Text(message.date, format: .dateTime.hour().minute())
                .font(.system(size: 10))
                .foregroundStyle(Theme.inkTertiary)
        }
        .padding(14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.lineSoft, lineWidth: 1))
    }

    private var userBubble: some View {
        VStack(alignment: .trailing, spacing: 5) {
            Text(message.text)
                .font(.system(size: 13))
                .foregroundStyle(Theme.ink)
                .lineSpacing(4)
            Text(message.date, format: .dateTime.hour().minute())
                .font(.system(size: 10))
                .foregroundStyle(Theme.inkTertiary)
        }
        .padding(14)
        .background(Theme.sageLight, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.sage.opacity(0.18), lineWidth: 1))
    }

    private func chip(_ reason: AIReason) -> some View {
        let (bg, fg) = chipColor(reason)
        return Text("\(reason.label) \(reason.value)")
            .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
            .foregroundStyle(fg)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(bg, in: RoundedRectangle(cornerRadius: 7))
    }

    private func chipColor(_ reason: AIReason) -> (Color, Color) {
        if reason.isDown {
            return (Theme.coralLight, Theme.coralDark)
        }
        if reason.label.contains("恢复") {
            return (Theme.sageLight, Theme.sageDark)
        }
        return (Theme.goldLight, Theme.goldDark)
    }
}

struct TypingIndicator: View {
    @State private var animate = false

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Theme.inkTertiary)
                    .frame(width: 6, height: 6)
                    .scaleEffect(animate ? 0.6 : 1.0)
                    .animation(.easeInOut(duration: 0.5).repeatForever().delay(Double(i) * 0.15), value: animate)
            }
        }
        .onAppear { animate = true }
    }
}
