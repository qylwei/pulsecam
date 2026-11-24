import SwiftUI

/// 打卡日历：当月点阵 + 已打卡天数统计。
struct CheckinCalendar: View {
    let checkedDays: Set<Date>
    @State private var monthOffset = 0

    private var cal: Calendar { .current }
    private var monthDate: Date {
        cal.date(byAdding: .month, value: monthOffset, to: Date()) ?? Date()
    }

    private var daysInMonth: Int {
        cal.range(of: .day, in: .month, for: monthDate)?.count ?? 30
    }

    private var firstWeekday: Int {
        let comps = cal.dateComponents([.year, .month], from: monthDate)
        let first = cal.date(from: comps) ?? Date()
        // 周日=1 ... 周六=7
        return cal.component(.weekday, from: first) - 1
    }

    private var checkedInCurrentMonth: Int {
        checkedDays.filter { cal.isDate($0, equalTo: monthDate, toGranularity: .month) }.count
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Button { monthOffset -= 1 } label: { Image(systemName: "chevron.left").font(.caption).foregroundStyle(Theme.inkTertiary) }
                Spacer()
                Text(monthTitle)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                Spacer()
                Button { monthOffset += 1 } label: { Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.inkTertiary) }
            }
            HStack(spacing: 0) {
                ForEach(["日", "一", "二", "三", "四", "五", "六"], id: \.self) { Text($0).font(.system(size: 10, weight: .semibold)) }
                    .frame(maxWidth: .infinity)
                    .foregroundStyle(Theme.inkTertiary)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 6) {
                ForEach(0..<firstWeekday, id: \.self) { _ in Color.clear.frame(height: 26) }
                ForEach(1...daysInMonth, id: \.self) { day in
                    dayCell(day: day)
                }
            }
            HStack {
                Text("● 已打卡 \(checkedInCurrentMonth) 天")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.sageDark)
                Spacer()
                Text("\(daysInMonth) 天")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.inkTertiary)
            }
        }
    }

    private var monthTitle: String {
        let f = DateFormatter()
        f.dateFormat = "yyyy · M月"
        return f.string(from: monthDate)
    }

    private func dayCell(day: Int) -> some View {
        let date = cal.date(byAdding: .day, value: day - cal.component(.day, from: monthDate), to: monthDate) ?? Date()
        let done = checkedDays.contains(where: { cal.isDate($0, inSameDayAs: date) })
        let isToday = cal.isDateInToday(date)
        return VStack(spacing: 4) {
            Text("\(day)")
                .font(.system(size: 11, weight: .regular))
                .foregroundStyle(Theme.ink)
            Circle()
                .fill(isToday ? Theme.gold : (done ? Theme.sage : Theme.divider))
                .frame(width: 6, height: 6)
                .overlay(isToday ? Circle().stroke(Theme.goldLight, lineWidth: 3) : nil)
        }
        .frame(height: 26)
    }
}
