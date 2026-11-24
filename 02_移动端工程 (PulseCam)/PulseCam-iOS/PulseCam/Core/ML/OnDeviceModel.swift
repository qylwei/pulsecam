import CoreML
import Foundation

/// 端侧小模型接入框架。
/// App bundle 中存在编译后的 Core ML 模型（PulseNet.mlmodelc）时使用模型推理；
/// 模型缺失时自动回退到内置规则/统计引擎，保证功能不中断。
/// 模型输入输出名如需调整，改 `features` / `prediction` 即可。
final class OnDeviceModel {
    static let shared = OnDeviceModel()

    private let recoveryModel: MLModel?

    init(modelName: String = "PulseNet") {
        if let url = Bundle.main.url(forResource: modelName, withExtension: "mlmodelc") {
            recoveryModel = try? MLModel(contentsOf: url)
        } else {
            recoveryModel = nil
        }
    }

    var isRecoveryModelLoaded: Bool { recoveryModel != nil }

    /// 输入：今日 HRV、压力指数、睡眠偏差(h)、星期(1-7)、3 日 HRV 趋势 → 输出明日 HRV。
    func predictTomorrowHRV(hrv: Double, stress: Double, sleepDelta: Double,
                            dayOfWeek: Int, hrvTrend: Double) -> Double? {
        guard let model = recoveryModel else { return nil }
        do {
            let input = try MLMultiArray(shape: [5], dataType: .double)
            input[0] = NSNumber(value: hrv)
            input[1] = NSNumber(value: stress)
            input[2] = NSNumber(value: sleepDelta)
            input[3] = NSNumber(value: dayOfWeek)
            input[4] = NSNumber(value: hrvTrend)
            let provider = try MLDictionaryFeatureProvider(dictionary: ["features": input])
            let output = try model.prediction(from: provider)
            if let scalar = output.featureValue(for: "prediction")?.doubleValue {
                return scalar
            }
            if let arr = output.featureValue(for: "prediction")?.multiArrayValue {
                return arr[0].doubleValue
            }
        } catch {
            return nil
        }
        return nil
    }
}
