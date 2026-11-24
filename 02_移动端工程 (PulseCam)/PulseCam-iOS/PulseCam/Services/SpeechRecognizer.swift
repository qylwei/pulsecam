import Foundation
import Speech
import AVFoundation
import Observation

/// 端侧语音输入（Speech 框架），用于"按住说话"健康提问。
@Observable
final class SpeechRecognizer {
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    private(set) var isAuthorized = false
    private(set) var isListening = false
    private(set) var latestTranscript: String?

    func requestAuthorization() async {
        if let status = try? await SFSpeechRecognizer.requestAuthorization() {
            isAuthorized = status == .authorized
        }
    }

    func start() {
        guard isAuthorized, let recognizer, recognizer.isAvailable,
              recognizer.supportsOnDeviceRecognition else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            return
        }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = false
        req.requiresOnDeviceRecognition = true
        request = req
        let node = audioEngine.inputNode
        let format = node.outputFormat(forBus: 0)
        node.removeTap(onBus: 0)
        node.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }
        audioEngine.prepare()
        try? audioEngine.start()
        task = recognizer.recognitionTask(with: req) { [weak self] result, _ in
            if let result, let text = result.bestTranscription.formattedString.nonEmpty {
                self?.latestTranscript = text
            }
        }
        isListening = true
    }

    func stop() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

private extension String {
    var nonEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
