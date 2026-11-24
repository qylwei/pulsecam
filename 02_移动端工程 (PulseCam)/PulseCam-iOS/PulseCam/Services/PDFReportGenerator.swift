import UIKit
import Foundation

/// PDF 健康周报生成（A4，UIKit 渲染）。
struct PDFReportGenerator {
    static let pageWidth: CGFloat = 595
    static let pageHeight: CGFloat = 842

    struct WeekSummary {
        var avgRecovery: Int
        var avgHRV: Double
        var avgStress: Int
        var avgSleep: Double?
        var days: [DailyHealthPoint]
        var advice: String
    }

    static func generate(history: [DailyHealthPoint], snapshots: [HealthSnapshot]) -> Data {
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
        return renderer.pdfData { ctx in
            ctx.beginPage()
            let cg = ctx.cgContext
            drawBackground(cg)
            let summary = makeSummary(history: history, snapshots: snapshots)
            drawHeader(cg)
            drawSummaryCards(cg, summary: summary)
            drawTrendChart(cg, summary: summary)
            drawTable(cg, summary: summary)
            drawAdvice(cg, summary: summary)
        }
    }

    // MARK: - Summary

    private static func makeSummary(history: [DailyHealthPoint], snapshots: [HealthSnapshot]) -> WeekSummary {
        let days = history.sorted { $0.date < $1.date }.suffix(7)
        guard !days.isEmpty else {
            return WeekSummary(avgRecovery: 75, avgHRV: 45, avgStress: 35, avgSleep: nil,
                               days: [], advice: "本周暂无测量数据，完成一次测量即可生成周报。")
        }
        let arr = Array(days)
        let avgRecovery = Int(arr.map { Double($0.recoveryScore) }.reduce(0, +) / Double(arr.count))
        let avgHRV = arr.map { $0.hrvSDNN }.reduce(0, +) / Double(arr.count)
        let avgStress = Int(arr.map { $0.stressIndex }.reduce(0, +) / Double(arr.count))
        let sleeps = arr.compactMap { $0.sleepHours }
        let avgSleep = sleeps.isEmpty ? nil : sleeps.reduce(0, +) / Double(sleeps.count)

        let latest = arr.last ?? arr[0]
        let context = AIContext(recoveryScore: latest.recoveryScore,
                                hrvToday: latest.hrvSDNN,
                                hrvBaseline: avgHRV,
                                sleepTonight: latest.sleepHours,
                                sleepBaseline: avgSleep ?? 7.3,
                                restingHR: snapshots.last?.heartRate ?? 62,
                                stressIndex: latest.stressIndex,
                                scenario: .daily,
                                history: Array(history.suffix(30)))
        let advice = AIHealthAdvisor.defaultSuggestion(context: context)
        return WeekSummary(avgRecovery: avgRecovery, avgHRV: avgHRV, avgStress: avgStress,
                           avgSleep: avgSleep, days: arr, advice: advice)
    }

    // MARK: - Drawing

    private static func drawBackground(_ cg: CGContext) {
        cg.setFillColor(UIColor(hex: 0xF4F2ED).cgColor)
        cg.fill(CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
    }

    private static func drawHeader(_ cg: CGContext) {
        drawText("PulseCam · 健康周报", at: CGPoint(x: 48, y: 60),
                 font: .systemFont(ofSize: 26, weight: .bold), color: UIColor(hex: 0x23211D))
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        drawText("生成时间 \(formatter.string(from: Date()))  ·  数据全部端侧生成",
                 at: CGPoint(x: 48, y: 96),
                 font: .systemFont(ofSize: 12), color: UIColor(hex: 0x9C978D))
        cg.setFillColor(UIColor(hex: 0xB9763F).cgColor)
        cg.fill(CGRect(x: 48, y: 116, width: 96, height: 3))
    }

    private static func drawSummaryCards(_ cg: CGContext, summary: WeekSummary) {
        let metrics: [(String, String, UIColor)] = [
            ("平均恢复指数", "\(summary.avgRecovery)", UIColor(hex: 0xB9763F)),
            ("平均 HRV", String(format: "%.0fms", summary.avgHRV), UIColor(hex: 0x4E8A6D)),
            ("平均压力", "\(summary.avgStress)", UIColor(hex: 0xC59A2E)),
            ("平均睡眠", summary.avgSleep.map { String(format: "%.1fh", $0) } ?? "—", UIColor(hex: 0x4E8A6D)),
        ]
        let cardWidth: CGFloat = (pageWidth - 96 - 24) / 4
        for (i, m) in metrics.enumerated() {
            let x = 48 + CGFloat(i) * (cardWidth + 8)
            cg.setFillColor(UIColor.white.cgColor)
            cg.fill(CGRect(x: x, y: 140, width: cardWidth, height: 84))
            cg.setFillColor(m.2.cgColor)
            cg.fill(CGRect(x: x, y: 140, width: 4, height: 84))
            drawText(m.0, at: CGPoint(x: x + 16, y: 152),
                     font: .systemFont(ofSize: 11), color: UIColor(hex: 0x9C978D))
            drawText(m.1, at: CGPoint(x: x + 16, y: 174),
                     font: .systemFont(ofSize: 20, weight: .bold), color: UIColor(hex: 0x23211D))
        }
    }

    private static func drawTrendChart(_ cg: CGContext, summary: WeekSummary) {
        drawText("每日恢复指数", at: CGPoint(x: 48, y: 258),
                 font: .systemFont(ofSize: 15, weight: .semibold), color: UIColor(hex: 0x23211D))
        let baseY: CGFloat = 430
        let left: CGFloat = 48
        let chartWidth: CGFloat = pageWidth - 96
        cg.setStrokeColor(UIColor(hex: 0xDDD8CC).cgColor)
        cg.setLineWidth(1)
        for i in 0...4 {
            let y = baseY - CGFloat(i) * 44
            cg.move(to: CGPoint(x: left, y: y))
            cg.addLine(to: CGPoint(x: left + chartWidth, y: y))
        }
        cg.strokePath()

        guard !summary.days.isEmpty else { return }
        let barWidth: CGFloat = 22
        let gap = (chartWidth - barWidth * CGFloat(summary.days.count)) / CGFloat(max(summary.days.count - 1, 1))
        let maxH: CGFloat = 160
        for (i, day) in summary.days.enumerated() {
            let h = maxH * CGFloat(day.recoveryScore) / 100
            let x = left + CGFloat(i) * (barWidth + gap)
            let y = baseY - h
            cg.setFillColor(UIColor(hex: 0xB9763F).cgColor)
            cg.fill(CGRect(x: x, y: y, width: barWidth, height: h))
            let formatter = DateFormatter()
            formatter.dateFormat = "MM-dd"
            drawText(formatter.string(from: day.date),
                     at: CGPoint(x: x - 2, y: baseY + 8),
                     font: .systemFont(ofSize: 9), color: UIColor(hex: 0x9C978D))
            drawText("\(day.recoveryScore)",
                     at: CGPoint(x: x - 2, y: y - 16),
                     font: .systemFont(ofSize: 9, weight: .medium), color: UIColor(hex: 0x6B675F))
        }
    }

    private static func drawTable(_ cg: CGContext, summary: WeekSummary) {
        drawText("每日明细", at: CGPoint(x: 48, y: 476),
                 font: .systemFont(ofSize: 15, weight: .semibold), color: UIColor(hex: 0x23211D))
        let rowH: CGFloat = 26
        let top: CGFloat = 492
        let left: CGFloat = 48
        let widths: [CGFloat] = [110, 110, 110, 110, 156]
        let headers = ["日期", "恢复指数", "HRV", "压力", "睡眠"]
        var x: CGFloat = left
        for (i, w) in widths.enumerated() {
            drawText(headers[i], at: CGPoint(x: x, y: top + 6),
                     font: .systemFont(ofSize: 11, weight: .semibold), color: UIColor(hex: 0x6B675F))
            x += w
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        for (row, day) in summary.days.enumerated() {
            let y = top + rowH * CGFloat(row + 1)
            if row % 2 == 0 {
                cg.setFillColor(UIColor.white.withAlphaComponent(0.6).cgColor)
                cg.fill(CGRect(x: left, y: y, width: widths.reduce(0, +), height: rowH))
            }
            let values = [formatter.string(from: day.date),
                          "\(day.recoveryScore)",
                          String(format: "%.0fms", day.hrvSDNN),
                          "\(Int(day.stressIndex))",
                          day.sleepHours.map { String(format: "%.1fh", $0) } ?? "—"]
            x = left
            for (i, w) in widths.enumerated() {
                drawText(values[i], at: CGPoint(x: x, y: y + 6),
                         font: .systemFont(ofSize: 11), color: UIColor(hex: 0x23211D))
                x += w
            }
        }
    }

    private static func drawAdvice(_ cg: CGContext, summary: WeekSummary) {
        cg.setFillColor(UIColor(hex: 0xEADBCB).cgColor)
        let rect = CGRect(x: 48, y: 700, width: pageWidth - 96, height: 96)
        cg.fill(rect)
        drawText("AI 周报建议", at: CGPoint(x: 64, y: 716),
                 font: .systemFont(ofSize: 13, weight: .bold), color: UIColor(hex: 0xB9763F))
        drawWrappedText(summary.advice, at: CGPoint(x: 64, y: 742), width: pageWidth - 128,
                        font: .systemFont(ofSize: 12), color: UIColor(hex: 0x23211D))
    }

    private static func drawWrappedText(_ text: String, at point: CGPoint, width: CGFloat,
                                        font: UIFont, color: UIColor) {
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        let rect = CGRect(x: point.x, y: point.y, width: width, height: 60)
        (text as NSString).draw(in: rect, withAttributes: attributes)
    }

    private static func drawText(_ text: String, at point: CGPoint, font: UIFont, color: UIColor) {
        let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        (text as NSString).draw(at: point, withAttributes: attributes)
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: 1)
    }
}
