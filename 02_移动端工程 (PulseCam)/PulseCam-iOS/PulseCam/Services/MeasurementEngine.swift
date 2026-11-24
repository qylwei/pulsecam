import Foundation
import AVFoundation
import Observation

/// 相机采样 + 缓冲 + 滑动窗口分析，驱动实时心率显示与 30 秒完成判定。
@Observable
final class MeasurementEngine: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    var liveHeartRate: Int = 0
    var liveConfidence: Double = 0
    var liveHRV: Double = 0
    var waveformSamples: [Float] = []
    var progress: Double = 0
    var faceDetected = false
    private(set) var isMeasuring = false
    private(set) var elapsed: TimeInterval = 0
    private(set) var finishedResult: PPGResult?

    let session = AVCaptureSession()
    var onAutoFinish: ((PPGResult) -> Void)?

    private let lock = NSLock()
    private let processingQueue = DispatchQueue(label: "pulsecam.camera", qos: .userInitiated)
    private let analysisQueue = DispatchQueue(label: "pulsecam.analysis", qos: .userInitiated)
    private let maxBuffer = Int(Constants.sampleRate * 45)
    private var buffer: [Float] = []
    private var sampleTimes: [TimeInterval] = []
    private var startTime: Date?
    private var faceBox: CGRect?
    private var frameCount = 0
    private var analysisCounter = 0
    private var simTimer: Timer?
    private var running = false
    private var simulating = false

    override init() {
        super.init()
        configureCamera()
    }

    var previewLayer: AVCaptureVideoPreviewLayer {
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        return layer
    }

    func start() {
        lock.lock()
        buffer.removeAll(keepingCapacity: true)
        sampleTimes.removeAll(keepingCapacity: true)
        finishedResult = nil
        faceBox = nil
        simulating = false
        analysisCounter = 0
        frameCount = 0
        waveformSamples = []
        liveHeartRate = 0
        liveConfidence = 0
        liveHRV = 0
        progress = 0
        elapsed = 0
        startTime = Date()
        isMeasuring = true
        running = true
        faceDetected = false
        lock.unlock()
        if session.isRunning == false {
            processingQueue.async { self.session.startRunning() }
        }
    }

    func startSimulation(heartRate: Double = 72) {
        lock.lock()
        buffer.removeAll(keepingCapacity: true)
        sampleTimes.removeAll(keepingCapacity: true)
        finishedResult = nil
        simulating = true
        analysisCounter = 0
        waveformSamples = []
        faceDetected = false
        liveHeartRate = 0
        liveConfidence = 0
        liveHRV = 0
        progress = 0
        elapsed = 0
        startTime = Date()
        isMeasuring = true
        running = true
        lock.unlock()
        let sig = PPGSignalGenerator.synthesize(fs: 30, seconds: 45, heartRate: Float(heartRate))
        var idx = 0
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] t in
            guard let self, self.isMeasuring else { t.invalidate(); return }
            if idx < sig.count {
                self.appendSample(sig[idx], date: Date())
                idx += 1
            } else {
                t.invalidate()
            }
        }
        simTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    /// 返回最终 PPGResult；重复调用返回已完成的缓存。
    func finish() -> PPGResult? {
        lock.lock()
        guard isMeasuring else {
            let cached = finishedResult
            lock.unlock()
            return cached
        }
        running = false
        isMeasuring = false
        simTimer?.invalidate()
        simTimer = nil
        let shouldStopCamera = session.isRunning
        let samples = resampledWindow()
        let hasFace = faceDetected
        let isDemo = simulating
        lock.unlock()
        if shouldStopCamera { processingQueue.async { self.session.stopRunning() } }

        if !isDemo && !hasFace { return nil }
        guard samples.count >= Int(Constants.sampleRate * 20) else { return nil }
        let result = PPGAnalyzer.analyze(samples)
        guard result.heartRate >= 40, result.heartRate <= 180,
              result.quality >= 0.5,
              result.ibi.count >= 5, result.hrv != nil else { return nil }
        finishedResult = result
        return result
    }

    func appendSample(_ v: Float, date: Date) {
        lock.lock()
        guard running else { lock.unlock(); return }
        buffer.append(v)
        sampleTimes.append(date.timeIntervalSinceReferenceDate)
        if buffer.count > maxBuffer {
            let excess = buffer.count - maxBuffer
            buffer.removeFirst(excess)
            sampleTimes.removeFirst(excess)
        }
        lock.unlock()
        analysisCounter += 1
        if analysisCounter >= Int(Constants.sampleRate) {
            analysisCounter = 0
            analyzeWindow()
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard running, isMeasuring, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        frameCount += 1
        if frameCount % 6 == 0 {
            if let face = FaceTracker.detect(in: pixelBuffer) {
                faceBox = face.roi
                faceDetected = true
            } else {
                faceBox = nil
                faceDetected = false
            }
        }
        guard let roi = faceBox else { return }
        let g = FaceTracker.greenMean(in: pixelBuffer, roi: roi)
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        guard timestamp.isValid else { return }
        appendSample(g, date: Date(timeIntervalSinceReferenceDate: timestamp.seconds))
    }

    private func analyzeWindow() {
        let samples: [Float]
        lock.lock()
        samples = resampledWindow()
        let elapsed = Date().timeIntervalSince(startTime ?? Date())
        lock.unlock()
        self.elapsed = elapsed
        let progressValue = min(1, elapsed / Constants.measurementSeconds)
        guard samples.count >= Int(Constants.sampleRate * 10) else {
            DispatchQueue.main.async { self.progress = progressValue }
            return
        }
        analysisQueue.async { [weak self] in
            guard let self else { return }
            let result = PPGAnalyzer.analyze(samples)
            let shouldFinish = progressValue >= 1
            DispatchQueue.main.async {
                self.liveHeartRate = Int(result.heartRate.rounded())
                self.liveConfidence = result.hrConfidence
                self.liveHRV = result.hrv?.sdnn ?? 0
                self.waveformSamples = Array(samples.suffix(300))
                self.progress = progressValue
                if shouldFinish, let r = self.finish() {
                    self.onAutoFinish?(r)
                }
            }
        }
    }

    // Interpolate irregular camera frames to the analyzer's fixed 30 Hz clock.
    private func resampledWindow() -> [Float] {
        guard buffer.count >= 2, sampleTimes.count == buffer.count else { return [] }
        let end = sampleTimes[buffer.count - 1]
        let start = max(sampleTimes[0], end - Constants.measurementSeconds)
        let count = Int((end - start) * Double(Constants.sampleRate))
        guard count > 1 else { return [] }
        var values: [Float] = []
        values.reserveCapacity(count)
        var index = 0
        for i in 0..<count {
            let t = start + Double(i) / Double(Constants.sampleRate)
            while index < sampleTimes.count - 2 && sampleTimes[index + 1] < t { index += 1 }
            let span = sampleTimes[index + 1] - sampleTimes[index]
            if span > 0.25 { return [] }
            let fraction = span > 0 ? Float((t - sampleTimes[index]) / span) : 0
            values.append(buffer[index] + (buffer[index + 1] - buffer[index]) * fraction)
        }
        return values
    }

    private func configureCamera() {
        session.sessionPreset = .vga640x480
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
              let input = try? AVCaptureDeviceInput(device: device) else { return }
        if session.canAddInput(input) { session.addInput(input) }
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: processingQueue)
        if session.canAddOutput(output) { session.addOutput(output) }
        if let conn = output.connection(with: .video) {
            conn.videoOrientation = .portrait
        }
    }
}
