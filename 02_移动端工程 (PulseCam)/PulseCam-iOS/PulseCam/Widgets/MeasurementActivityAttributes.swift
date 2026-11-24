import Foundation
import ActivityKit

struct MeasurementAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var heartRate: Int
        var progress: Double
        var recoveryScore: Int?
    }
    var scenarioName: String
}
