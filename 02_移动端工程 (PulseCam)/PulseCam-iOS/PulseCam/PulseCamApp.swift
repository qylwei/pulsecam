import SwiftUI

@main
struct PulseCamApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(appModel)
                .tint(Theme.accent)
        }
    }
}
