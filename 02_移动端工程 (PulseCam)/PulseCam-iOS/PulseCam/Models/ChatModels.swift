import Foundation

enum ChatRole: String, Codable {
    case user
    case assistant
}

struct AIReason: Codable, Equatable {
    var label: String
    var value: String
    var isDown: Bool
}

struct ChatMessage: Codable, Identifiable, Equatable {
    var id = UUID()
    var role: ChatRole
    var text: String
    var date = Date()
    var reasons: [AIReason] = []
}

struct AIResponse {
    var headline: String
    var explanation: String
    var suggestion: String
    var reasons: [AIReason]
    var predictedHrv: Double?
}
