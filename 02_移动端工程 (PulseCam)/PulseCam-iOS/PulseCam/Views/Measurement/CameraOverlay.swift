import SwiftUI
import UIKit

/// 相机预览上的视觉层：网格 + 状态标签 + ROI 四角框 + 扫描线 + 浮动读数卡。
struct CameraOverlay: View {
    let heartRate: Int
    let hrv: Int
    @State private var scanTop = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                grid
                VStack {
                    HStack(spacing: 6) {
                        Circle().fill(Theme.coral).frame(width: 6, height: 6)
                        Text("前置摄像头 · 实时预览")
                            .font(.system(size: 10))
                            .tracking(1)
                    }
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.horizontal, 12).padding(.vertical, 4)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.white.opacity(0.1), lineWidth: 1))
                    .padding(.top, 12)
                    Spacer()
                }
                .frame(maxWidth: .infinity)

                roiBox(width: geo.size.width * 0.46, height: geo.size.height * 0.6)

                scanLine(width: geo.size.width * 0.46)
                    .offset(y: scanTop ? -geo.size.height * 0.26 : geo.size.height * 0.26)
                    .animation(.easeInOut(duration: 2.6).repeatForever(autoreverses: true), value: scanTop)

                floatCard
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(12)
            }
            .onAppear { scanTop = true }
        }
    }

    private var grid: some View {
        Canvas { ctx, size in
            var path = Path()
            var x: CGFloat = 0
            while x <= size.width {
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                x += 20
            }
            var y: CGFloat = 0
            while y <= size.height {
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                y += 20
            }
            ctx.stroke(path, with: .color(.white.opacity(0.07)), lineWidth: 0.5)
        }
    }

    private func roiBox(width: CGFloat, height: CGFloat) -> some View {
        CornerBracket(corners: [.topLeft, .topRight, .bottomLeft, .bottomRight])
            .stroke(Theme.gold, style: StrokeStyle(lineWidth: 2, lineCap: .round))
            .frame(width: width, height: height)
            .overlay(alignment: .bottom) {
                Text("对齐参考区域")
                    .font(.system(size: 9.5, design: .monospaced))
                    .foregroundStyle(Theme.gold.opacity(0.9))
                    .offset(y: 22)
            }
    }

    private func scanLine(width: CGFloat) -> some View {
        Rectangle()
            .fill(LinearGradient(colors: [.clear, Theme.sage, .clear],
                                 startPoint: .leading, endPoint: .trailing))
            .frame(width: width, height: 2)
            .shadow(color: Theme.sage.opacity(0.7), radius: 4)
    }

    private var floatCard: some View {
        HStack(spacing: 14) {
            VStack(spacing: 2) {
                Text(heartRate > 0 ? "\(heartRate)" : "—")
                    .font(.system(size: 18, weight: .regular, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.9))
                Text("HR").font(.system(size: 9.5)).opacity(0.5).foregroundStyle(.white)
            }
            Rectangle().fill(.white.opacity(0.12)).frame(width: 1, height: 26)
            VStack(spacing: 2) {
                Text(hrv > 0 ? "\(hrv)" : "—")
                    .font(.system(size: 18, weight: .regular, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.9))
                Text("HRV").font(.system(size: 9.5)).opacity(0.5).foregroundStyle(.white)
            }
        }
        .padding(.horizontal, 13).padding(.vertical, 8)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(.white.opacity(0.1), lineWidth: 1))
    }
}

struct CornerBracket: Shape {
    var corners: UIRectCorner = [.topLeft, .bottomRight]

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let l = min(rect.width, rect.height) * 0.5
        if corners.contains(.topLeft) {
            p.move(to: CGPoint(x: 0, y: l)); p.addLine(to: CGPoint(x: 0, y: 0)); p.addLine(to: CGPoint(x: l, y: 0))
        }
        if corners.contains(.topRight) {
            p.move(to: CGPoint(x: rect.width - l, y: 0))
            p.addLine(to: CGPoint(x: rect.width, y: 0))
            p.addLine(to: CGPoint(x: rect.width, y: l))
        }
        if corners.contains(.bottomLeft) {
            p.move(to: CGPoint(x: 0, y: rect.height - l))
            p.addLine(to: CGPoint(x: 0, y: rect.height))
            p.addLine(to: CGPoint(x: l, y: rect.height))
        }
        if corners.contains(.bottomRight) {
            p.move(to: CGPoint(x: rect.width - l, y: rect.height))
            p.addLine(to: CGPoint(x: rect.width, y: rect.height))
            p.addLine(to: CGPoint(x: rect.width, y: rect.height - l))
        }
        return p
    }
}
