import SwiftUI

/// 仅显示相机实际采样（或明确开启模拟模式时的合成样本）。
struct WaveformView: View {
    let samples: [Float]

    var body: some View {
        Canvas { context, size in
            guard samples.count > 1 else { return }
            let mean = samples.reduce(0, +) / Float(samples.count)
            let centered = samples.map { $0 - mean }
            let amplitude = max(centered.map { abs($0) }.max() ?? 0, 0.01)
            var path = Path()
            for (index, value) in centered.enumerated() {
                let point = CGPoint(
                    x: size.width * CGFloat(index) / CGFloat(samples.count - 1),
                    y: size.height / 2 - CGFloat(value / amplitude) * size.height * 0.4
                )
                if index == 0 { path.move(to: point) }
                else { path.addLine(to: point) }
            }
            context.stroke(path, with: .color(Theme.sageDark), lineWidth: 1.4)
        }
        .frame(height: 36)
        .accessibilityLabel("采样信号波形")
    }
}
