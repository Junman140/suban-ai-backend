"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.balanceTracker = void 0;
const TokenBalance_1 = require("../../models/TokenBalance");
const UsageRecord_1 = require("../../models/UsageRecord");
const price_oracle_service_1 = __importDefault(require("./price-oracle.service"));
/**
 * Balance Tracker Service
 * Manages user token balances and deductions
 */
class BalanceTrackerService {
    /**
     * Get user balance
     */
    getBalance(walletAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            let balance = yield TokenBalance_1.TokenBalance.findOne({ walletAddress });
            if (!balance) {
                // Create new balance entry
                balance = new TokenBalance_1.TokenBalance({
                    walletAddress,
                    depositedAmount: 0,
                    consumedAmount: 0,
                    currentBalance: 0,
                    transactions: [],
                });
                yield balance.save();
            }
            return balance;
        });
    }
    /**
     * Record a deposit
     */
    recordDeposit(walletAddress, amount, txHash) {
        return __awaiter(this, void 0, void 0, function* () {
            const balance = yield this.getBalance(walletAddress);
            balance.depositedAmount += amount;
            balance.currentBalance += amount;
            balance.transactions.push({
                type: 'deposit',
                amount,
                txHash,
                timestamp: new Date(),
            });
            yield balance.save();
            console.log(` Recorded deposit: ${amount} tokens for ${walletAddress}`);
            return balance;
        });
    }
    /**
     * Deduct tokens for usage
     */
    deductTokens(walletAddress, amount, requestType, usdCost) {
        return __awaiter(this, void 0, void 0, function* () {
            const balance = yield this.getBalance(walletAddress);
            if (balance.currentBalance < amount) {
                throw new Error('Insufficient token balance');
            }
            balance.consumedAmount += amount;
            balance.currentBalance -= amount;
            balance.transactions.push({
                type: 'usage',
                amount: -amount, // Negative for deduction
                timestamp: new Date(),
                metadata: {
                    requestType,
                    usdCost,
                },
            });
            yield balance.save();
            // Record usage for settlement
            const tokenPrice = price_oracle_service_1.default.getTWAPPrice();
            yield UsageRecord_1.UsageRecord.create({
                walletAddress,
                requestType,
                usdCost,
                tokenPrice,
                tokensBurned: amount,
                settled: false,
            });
            console.log(` Deducted ${amount} tokens from ${walletAddress}`);
            return balance;
        });
    }
    /**
     * Check if user has sufficient balance
     */
    hasSufficientBalance(walletAddress, requiredAmount) {
        return __awaiter(this, void 0, void 0, function* () {
            const balance = yield this.getBalance(walletAddress);
            return balance.currentBalance >= requiredAmount;
        });
    }
    /**
     * Get usage history for a wallet
     */
    getUsageHistory(walletAddress_1) {
        return __awaiter(this, arguments, void 0, function* (walletAddress, limit = 50) {
            const records = yield UsageRecord_1.UsageRecord.find({ walletAddress })
                .sort({ timestamp: -1 })
                .limit(limit)
                .lean();
            return records;
        });
    }
    /**
     * Get total statistics
     */
    getTotalStats() {
        return __awaiter(this, void 0, void 0, function* () {
            const stats = yield TokenBalance_1.TokenBalance.aggregate([
                {
                    $group: {
                        _id: null,
                        totalDeposited: { $sum: '$depositedAmount' },
                        totalConsumed: { $sum: '$consumedAmount' },
                        totalUsers: { $sum: 1 },
                    },
                },
            ]);
            if (stats.length === 0) {
                return {
                    totalDeposited: 0,
                    totalConsumed: 0,
                    totalUsers: 0,
                };
            }
            return stats[0];
        });
    }
    /**
     * Get unsettled usage records (for batch settlement)
     */
    getUnsettledRecords() {
        return __awaiter(this, arguments, void 0, function* (limit = 100) {
            return yield UsageRecord_1.UsageRecord.find({ settled: false })
                .sort({ timestamp: 1 })
                .limit(limit)
                .lean();
        });
    }
    /**
     * Mark records as settled
     */
    markAsSettled(recordIds, txHash) {
        return __awaiter(this, void 0, void 0, function* () {
            yield UsageRecord_1.UsageRecord.updateMany({ _id: { $in: recordIds } }, { $set: { settled: true, txHash } });
            console.log(` Marked ${recordIds.length} records as settled`);
        });
    }
}
// Singleton instance
exports.balanceTracker = new BalanceTrackerService();
exports.default = exports.balanceTracker;
