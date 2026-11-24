import SwiftUI

/// 数字孪生三线趋势：恢复(实线深墨) · 睡眠(虚线sage) · 压力(点线薰衣草)。
struct TwinChart: View {
    let recovery: [Double]
    let sleep: [Double]
    let stress: [Double]

    var body: some View {
        GeometryReader { geo in
            let all = recovery + sleep + stress
            let minV = min(all.min() ?? 0, 50)
            let maxV = max(all.max() ?? 100, 100)
            let span = max(maxV - minV, 1)

            func pts(_ data: [Double]) -> [CGPoint] {
                guard data.count > 1 else { return [] }
                let stepX = geo.size.width / CGFloat(data.count - 1)
                return data.enumerated().map { i, v in
                    CGPoint(x: CGFloat(i) * stepX,
                            y: geo.size.height - CGFloat((v - minV) / span) * (geo.size.height - 10) - 5)
                }
            }

            ZStack {
                ForEach(0..<4, id: \.self) { i in
                    let y = geo.size.height * CGFloat(i) / 3
                    Path { p in p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: geo.size.width, y: y)) }
                        .stroke(Theme.grid.opacity(0.35), style: StrokeStyle(lineWidth: 0.5))
                }
                let r = pts(recovery)
                if !r.isEmpty {
                    polyline(r).stroke(Theme.ink, style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                }
                let s = pts(sleep)
                if !s.isEmpty {
                    polyline(s).stroke(Theme.sage, style: StrokeStyle(lineWidth: 1.2, dash: [5, 3]))
                }
                let t = pts(stress)
                if !t.isEmpty {
                    polyline(t).stroke(Theme.lavender, style: StrokeStyle(lineWidth: 1.2, dash: [3, 3]))
                }
            }
        }
    }

    private func polyline(_ pts: [CGPoint]) -> Path {
        Path { p in
            p.move(to: pts[0])
            for pt in pts.dropFirst() { p.addLine(to: pt) }
        }
    }
}

struct TwinLegend: View {
    var body: some View {
        HStack(spacing: 16) {
            legendDot(color: Theme.ink, label: "恢复")
            legendDot(color: Theme.sage, label: "睡眠")
            legendDot(color: Theme.lavender, label: "压力")
        }
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(Theme.inkSecondary)
    }

    private func legendDot(color: Color, label: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(label)
        }
    }
}
