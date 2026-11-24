# PulseCam 参赛工程审阅指南

版本：2026-11-05 提交版

## 目录

- `01_Web全栈工程 (PulseLog)/`：本机 Web/PWA，含扫脸自检、心率、短时 HRV、记录与 AI 顾问。
- `03_文档/`：人工智能工具使用情况说明（PDF / DOCX）。
- `启动PulseLog.bat` / `启动PulseLog.ps1`：Windows 一键启动。
- `_工作资料/`：内部文档、QA 截图、本地数据备份（不随包提交）。

## 运行（Windows）

1. 双击 `启动PulseLog.bat`；
2. 服务就绪后自动打开 `http://localhost:3100`；
3. 仅本机运行：

```
powershell -NoProfile -ExecutionPolicy Bypass -File ".\启动PulseLog.ps1" -LocalOnly
```

macOS / Linux：

```
cd "01_Web全栈工程 (PulseLog)"
npm ci
sh start.sh
```

依赖已完整随包附带。

## 测量口径

- 5 秒：面部、光照、姿态、稳定度自检，不产出任何生理指标；
- 15 秒：心率估算，带置信度，质量不足会拒测；
- 60 秒：心率 + 短时 RMSSD/SDNN，标注“短时程参考”；
- 未测量的心率/HRV/呼吸显示为 `—`，不做默认值填充。

## 数据与隐私

- 本机记录保存在 `01_Web全栈工程 (PulseLog)/data/pulselog.db`，首次运行自动生成；
- 摄像头视频帧只在浏览器内存中取均值，不上传、不落盘；
- AI 默认使用本地规则；只有主动配置云端 Key 并提问时才发送问题与近期记录摘要；
- 本包不包含本机数据库与 API Key。

## 测试

```
cd "01_Web全栈工程 (PulseLog)"
npm test
npm run validate
```

## 已知限制

- 心率算法仅在合成信号上验证，尚未完成真人与参考设备对照，不能用于诊断；
- 未配置云端 Key 时，AI 由本地规则回答，能力有限。
