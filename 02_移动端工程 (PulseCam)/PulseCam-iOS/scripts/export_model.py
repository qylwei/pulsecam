"""导出 PulseNet.mlmodel 的示例脚本（Core ML 端侧小模型）。

依赖: pip install coremltools scikit-learn numpy
用法: python scripts/export_model.py
产物: PulseNet.mlmodel —— 在 Xcode 中拖入工程即编译为 PulseNet.mlmodelc，
       被 OnDeviceModel 自动加载（同名 .mlmodelc 打包进 App 时走模型推理，
       否则自动回退到内置规则引擎）。
"""
import numpy as np


def main():
    try:
        from sklearn.linear_model import LinearRegression
        import coremltools as ct
    except ImportError as e:
        print("缺少依赖：pip install coremltools scikit-learn")
        raise SystemExit(1)

    rng = np.random.default_rng(0)
    # 特征: [今日HRV, 压力, 睡眠偏差, 星期, 3日HRV趋势]
    X = rng.normal(size=(400, 5))
    y = 0.80 * X[:, 0] - 0.20 * X[:, 1] + 1.20 * X[:, 2] + 0.30 * X[:, 3] + 1.50 * X[:, 4] + 46.0

    lr = LinearRegression().fit(X, y)
    model = ct.convert(lr, feature_names=["features"], target="prediction")
    model.save("PulseNet.mlmodel")
    print("已导出 PulseNet.mlmodel（输入 features[5]，输出 prediction 标量）。")
    print("下一步：拖入 Xcode 工程 → 编译成 PulseNet.mlmodelc → 打包进 App。")


if __name__ == "__main__":
    main()
