import Foundation
import HealthKit
import Observation

@Observable
final class HealthKitManager {
    let hkStore = HKHealthStore()
    private(set) var isAuthorized = false

    private var typesToWrite: Set<HKSampleType> {
        var set = Set<HKSampleType>()
        [.heartRate, .heartRateVariabilitySDNN, .respiratoryRate].forEach {
            if let t = HKQuantityType($0) { set.insert(t) }
        }
        return set
    }

    private var typesToRead: Set<HKObjectType> {
        var set = Set<HKObjectType>()
        [.heartRate, .heartRateVariabilitySDNN, .respiratoryRate, .stepCount, .activeEnergyBurned].forEach {
            if let t = HKQuantityType($0) { set.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { set.insert(sleep) }
        return set
    }

    func requestAuthorization() async {
        let toRead = typesToRead
        let toWrite = typesToWrite
        do {
            try await hkStore.requestAuthorization(toShare: toWrite, read: toRead)
            await MainActor.run { isAuthorized = true }
        } catch {
            await MainActor.run { isAuthorized = false }
        }
    }

    func write(snapshot: HealthSnapshot) {
        guard isAuthorized else { return }
        let end = snapshot.date
        let start = end.addingTimeInterval(-30)
        let countPerMinute = HKUnit.count().unitDivided(by: .minute())
        var samples: [HKQuantitySample] = []

        if let t = HKQuantityType(.heartRate), snapshot.heartRate > 0 {
            samples.append(.init(type: t,
                                 quantity: .init(unit: countPerMinute, doubleValue: snapshot.heartRate),
                                 start: start, end: end))
        }
        if let t = HKQuantityType(.heartRateVariabilitySDNN), snapshot.hrvSDNN > 0 {
            samples.append(.init(type: t,
                                 quantity: .init(unit: .millisecond(), doubleValue: snapshot.hrvSDNN),
                                 start: start, end: end))
        }
        if let t = HKQuantityType(.respiratoryRate), snapshot.respiratoryRate > 0 {
            samples.append(.init(type: t,
                                 quantity: .init(unit: countPerMinute, doubleValue: snapshot.respiratoryRate),
                                 start: start, end: end))
        }
        guard !samples.isEmpty else { return }
        hkStore.save(samples) { _, _ in }
    }

    func lastNightSleepHours() async -> Double? {
        await withCheckedContinuation { continuation in
            guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
                continuation.resume(returning: nil)
                return
            }
            let start = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
            let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
            let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit,
                                      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, samples, _ in
                guard let samples = samples as? [HKCategorySample] else {
                    continuation.resume(returning: nil)
                    return
                }
                let total = samples.reduce(0.0) { acc, s in
                    acc + s.endDate.timeIntervalSince(s.startDate) / 3600
                }
                continuation.resume(returning: total > 0 ? total : nil)
            }
            hkStore.execute(query)
        }
    }

    func averageHRV(days: Int) async -> Double? {
        await withCheckedContinuation { continuation in
            guard let hrvType = HKQuantityType(.heartRateVariabilitySDNN) else {
                continuation.resume(returning: nil)
                return
            }
            let start = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
            let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: hrvType, quantitySamplePredicate: predicate,
                                          options: .discreteAverage) { _, statistics, _ in
                let avg = statistics?.averageQuantity()?.doubleValue(for: .millisecond())
                continuation.resume(returning: avg)
            }
            hkStore.execute(query)
        }
    }
}
