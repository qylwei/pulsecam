import SwiftUI
import AVFoundation

struct CameraPreviewView: UIViewRepresentable {
    let engine: MeasurementEngine

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .black
        let layer = engine.previewLayer
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        if let layer = uiView.layer.sublayers?.first as? AVCaptureVideoPreviewLayer {
            layer.frame = uiView.bounds
        }
    }
}
