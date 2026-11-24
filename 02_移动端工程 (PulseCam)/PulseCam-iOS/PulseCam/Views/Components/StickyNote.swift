import SwiftUI

/// 便签风格建议卡：旋转卡片 + 顶部胶贴点 + 彩色标签。
struct StickyNote: View {
    let title: String
    let symbol: String
    let tags: [Recommendation]
    let tint: Color
    let tintLight: Color
    let tintDark: Color
    var rotation: Double = -1.4

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 12))
                    .foregroundStyle(tintDark)
                Text(title)
                    .font(.system(size: 12.5, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
            FlowTags(tags: tags)
        }
        .padding(15)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tintLight, in: RoundedRectangle(cornerRadius: 14))
        .overlay(alignment: .leading) {
            Rectangle().fill(tint).frame(width: 3)
                .clipShape(RoundedRectangle(cornerRadius: 2))
                .padding(.vertical, 12)
        }
        .overlay(alignment: .top) {
            Circle()
                .fill(RadialGradient(colors: [Color.white, Color(hex: 0x9C978B)],
                                     center: .topLeading, startRadius: 1, endRadius: 6))
                .frame(width: 12, height: 12)
                .offset(y: -4)
        }
        .rotationEffect(.degrees(rotation))
    }
}

struct FlowTags: View {
    let tags: [Recommendation]
    var body: some View {
        HStack(spacing: 6) {
            ForEach(tags) { tag in
                Label(tag.title, systemImage: tag.symbol)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.inkSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.55), in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.black.opacity(0.05), lineWidth: 1))
            }
        }
    }
}
