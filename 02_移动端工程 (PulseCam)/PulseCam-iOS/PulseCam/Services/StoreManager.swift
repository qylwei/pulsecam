import Foundation
import StoreKit
import Observation

@Observable
final class StoreManager {
    private(set) var proProduct: Product?
    private(set) var isPro = false
    private(set) var isLoading = false

    private var updates: Task<Void, Never>?

    init() {
        updates = Task { [weak self] in
            for await _ in Transaction.updates {
                try? await self?.refresh()
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    func load() async {
        do {
            let products = try await Product.products(for: [Constants.proProductID])
            proProduct = products.first
            await refresh()
        } catch {
            proProduct = nil
        }
    }

    func purchase() async {
        guard let product = proProduct else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                if case .verified(let transaction) = verification {
                    await transaction.finish()
                }
            case .pending, .userCancelled:
                break
            @unknown default:
                break
            }
            await refresh()
        } catch {
            await refresh()
        }
    }

    func restore() async {
        try? await AppStore.sync()
        await refresh()
    }

    func refresh() async {
        var purchased = false
        for await entitlement in Transaction.currentEntitlements {
            if case .verified(let tx) = entitlement, tx.productID == Constants.proProductID {
                purchased = true
            }
        }
        await MainActor.run {
            isPro = purchased
            UserDefaults(suiteName: Constants.appGroup)?.set(purchased, forKey: Constants.suiteKeys.pro)
        }
    }
}
