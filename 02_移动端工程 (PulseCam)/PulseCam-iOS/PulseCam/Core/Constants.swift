import Foundation

enum Constants {
    static let appGroup = "group.com.pulsecam.app"
    static let proProductID = "com.pulsecam.pro"
    static let proMonthlyPrice = "¥18/月"

    static let measurementSeconds = 30.0
    static let sampleRate: Float = 30

    static let hbLowerHz: Float = 0.8
    static let hbUpperHz: Float = 2.5
    static let respLowerHz: Float = 0.10
    static let respUpperHz: Float = 0.50

    static let suiteKeys = SuiteKeys()
}

struct SuiteKeys {
    let history = "pulsecam.history"
    let snapshots = "pulsecam.snapshots"
    let chat = "pulsecam.chat"
    let pro = "pulsecam.pro"
    let settings = "pulsecam.settings"
}
