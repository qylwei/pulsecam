import SwiftUI

/// 迷你趋势线（sparkline），带面积渐变。
struct Sparkline: View {
    let values: [Double]
    var color: Color = Theme.sage
    var height: CGFloat = 22

    var body: some View {
        GeometryReader { geo in
            let pts = points(in: geo.size)
            ZStack {
                if pts.count > 1 {
                    areaPath(pts)
                        .fill(LinearGradient(colors: [color.opacity(0.25), color.opacity(0.02)],
                                             startPoint: .top, endPoint: .bottom))
                    linePath(pts)
                        .stroke(color, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .frame(height: height)
    }

    private func points(in size: CGSize) -> [CGPoint] {
        guard values.count > 1 else { return [] }
        let minV = values.min() ?? 0
        let maxV = max(values.max() ?? 1, minV + 1)
        let stepX = size.width / CGFloat(values.count - 1)
        return values.enumerated().map { i, v in
            CGPoint(x: CGFloat(i) * stepX,
                    y: size.height - CGFloat((v - minV) / (maxV - minV)) * (size.height - 4) - 2)
        }
    }

    private func linePath(_ pts: [CGPoint]) -> Path {
        Path { p in
            p.move(to: pts[0])
            for pt in pts.dropFirst() { p.addLine(to: pt) }
        }
    }

    private func areaPath(_ pts: [CGPoint]) -> Path {
        Path { p in
            p.move(to: CGPoint(x: pts[0].x, y: 0))
            p.addLine(to: pts[0])
            for pt in pts.dropFirst() { p.addLine(to: pt) }
            p.addLine(to: CGPoint(x: pts.last!.x, y: 0))
            p.closeSubpath()
        }
    }
}
