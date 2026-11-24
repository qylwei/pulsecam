import SwiftUI

/// 恢复稳定性分段指示条（11 段，中间 3 段用健康金）。
struct StabilityBar: View {
    let score: Int

    private var lit: Int { max(3, min(11, 5 + score / 20)) }

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<11, id: \.self) { i in
                let isOn = i < lit
                RoundedRectangle(cornerRadius: 2)
                    .fill(color(isOn: isOn, index: i))
                    .frame(maxWidth: .infinity)
                    .frame(height: 3)
            }
        }
    }

    private func color(isOn: Bool, index: Int) -> Color {
        guard isOn else { return Theme.lineSoft }
        return (index >= 6 && index <= 8) ? Theme.gold : Theme.sage
    }
}
