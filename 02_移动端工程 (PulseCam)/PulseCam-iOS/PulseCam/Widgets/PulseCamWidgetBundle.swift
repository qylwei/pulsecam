import SwiftUI
import WidgetKit

/// Widget 注册入口。
/// 当前工程为单目标（主 App），此 Bundle 不挂 @main。
/// 如需让主屏 Widget 生效：在 Xcode 新建 "Widget Extension" 目标，把本目录
/// PulseCamWidget.swift / PulseCamWidgetBundle.swift 加入该目标，并去掉 @main 的注释即可。
// @main
struct PulseCamWidgetBundle: WidgetBundle {
    var body: some Widget {
        PulseCamWidget()
        // MeasurementLiveActivity() 需要 App Group 与 extension 支持，可一并注册
    }
}
