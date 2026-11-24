import SwiftUI

/// PulseCam v5 设计令牌 —— 鼠尾草绿 + 健康金 + 珊瑚/雾蓝/薰衣草点缀，暖白/雾灰/浅银背景。
enum Theme {
    // 背景层
    static let warm = Color(hex: 0xFBF8F3)
    static let fog = Color(hex: 0xF1F0EC)
    static let silver = Color(hex: 0xECEEF0)
    static let mint = Color(hex: 0xF1F5F1)
    static let sand = Color(hex: 0xFAF4E7)
    static let background = warm

    // 卡片
    static let card = Color(hex: 0xFFFFFE)
    static let cardSecondary = fog

    // 文字
    static let ink = Color(hex: 0x23221E)
    static let inkSecondary = Color(hex: 0x58564E)
    static let inkTertiary = Color(hex: 0x9C978B)

    // 主色 sage
    static let sage = Color(hex: 0x7C9A82)
    static let sageLight = Color(hex: 0xEBF2EB)
    static let sageDark = Color(hex: 0x4F6E56)
    static let accent = sage
    static let accentSoft = sageLight
    static let accentStrong = sageDark
    static let success = sage

    // 健康金
    static let gold = Color(hex: 0xC79A55)
    static let goldLight = Color(hex: 0xFBF2DF)
    static let goldDark = Color(hex: 0x8C6C34)
    static let warning = gold

    // 珊瑚（谨慎）
    static let coral = Color(hex: 0xD98D82)
    static let coralLight = Color(hex: 0xFBEEEB)
    static let coralDark = Color(hex: 0xB15D50)
    static let danger = coral

    // 雾蓝（情景）
    static let fogBlue = Color(hex: 0x86A0B6)
    static let fogBlueLight = Color(hex: 0xEDF2F6)
    static let fogBlueDark = Color(hex: 0x4F6C82)

    // 薰衣草（AI）
    static let lavender = Color(hex: 0x9C8FB2)
    static let lavenderLight = Color(hex: 0xF3F0F8)
    static let lavenderDark = Color(hex: 0x6C5F87)

    // 描边
    static let divider = Color(hex: 0xE4E0D7)
    static let lineSoft = Color(hex: 0xEEEBE3)
    static let grid = Color(hex: 0xE4E0D7)

    static let shadow = Color(hex: 0x231C0F).opacity(0.07)
    static let shadowSoft = Color(hex: 0x231C0F).opacity(0.05)
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}

extension Font {
    static func metric(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .rounded).monospacedDigit()
    }
}

extension View {
    func cardStyle(corner: CGFloat = 22) -> some View {
        background(Theme.card, in: RoundedRectangle(cornerRadius: corner))
            .overlay(RoundedRectangle(cornerRadius: corner).stroke(Theme.lineSoft, lineWidth: 1))
            .shadow(color: Theme.shadow, radius: 12, x: 0, y: 4)
    }

    func darkPanelStyle(corner: CGFloat = 22) -> some View {
        background(LinearGradient(colors: [Color(hex: 0x2A2C2E), Color(hex: 0x232527)],
                                  startPoint: .top, endPoint: .bottom), in: RoundedRectangle(cornerRadius: corner))
            .overlay(RoundedRectangle(cornerRadius: corner).stroke(Color(hex: 0x3A3C3E), lineWidth: 1))
            .shadow(color: Theme.shadow, radius: 14, x: 0, y: 6)
    }
}
