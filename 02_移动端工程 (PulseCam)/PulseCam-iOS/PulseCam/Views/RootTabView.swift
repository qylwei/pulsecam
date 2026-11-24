import SwiftUI

struct RootTabView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("概览", systemImage: "heart.fill") }
            MeasurementView()
                .tabItem { Label("测量", systemImage: "camera.viewfinder") }
            AIChatView()
                .tabItem { Label("AI助手", systemImage: "waveform.path.ecg") }
            SettingsView()
                .tabItem { Label("设置", systemImage: "gearshape.fill") }
        }
        .tint(Theme.accent)
        .task {
            app.ensureAuthorization()
            await app.storeManager.load()
        }
    }
}
