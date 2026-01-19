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
const express_1 = require("express");
const balance_tracker_service_1 = __importDefault(require("../services/solana/balance-tracker.service"));
const price_oracle_service_1 = __importDefault(require("../services/solana/price-oracle.service"));
const settlement_service_1 = __importDefault(require("../services/solana/settlement.service"));
const transaction_verifier_service_1 = __importDefault(require("../services/solana/transaction-verifier.service"));
const jupiter_service_1 = __importDefault(require("../services/solana/jupiter.service"));
const TokenBalance_1 = require("../models/TokenBalance");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const router = (0, express_1.Router)();
/**
 * GET /api/token/balance/:walletAddress
 * Get user token balance
 */
router.get('/balance/:walletAddress', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { walletAddress } = req.params;
        if (!walletAddress) {
            return res.status(400).json({ error: 'Wallet address required' });
        }
        const balance = yield balance_tracker_service_1.default.getBalance(walletAddress);
        res.json({
            walletAddress: balance.walletAddress,
            currentBalance: balance.currentBalance,
            depositedAmount: balance.depositedAmount,
            consumedAmount: balance.consumedAmount,
            lastUpdated: balance.lastUpdated,
        });
    }
    catch (error) {
        console.error('Error fetching balance:', error);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
}));
/**
 * GET /api/token/price
 * Get current token price (TWAP)
 */
router.get('/price', rateLimit_middleware_1.costCalculationRateLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Try to get cached price first
        let price = price_oracle_service_1.default.getCachedPrice();
        if (!price) {
            // Fetch fresh price if cache is stale
            price = yield price_oracle_service_1.default.fetchCurrentPrice();
        }
        const twapPrice = price_oracle_service_1.default.getTWAPPrice();
        res.json({
            currentPrice: price,
            twapPrice,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Error fetching price:', error);
        res.status(500).json({ error: 'Failed to fetch token price' });
    }
}));
/**
 * GET /api/token/stats
 * Get public burn and usage statistics
 */
router.get('/stats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const totalStats = yield balance_tracker_service_1.default.getTotalStats();
        const settlementStats = yield settlement_service_1.default.getSettlementStats();
        res.json({
            totalUsers: totalStats.totalUsers,
            totalDeposited: totalStats.totalDeposited,
            totalConsumed: totalStats.totalConsumed,
            totalBurned: settlementStats.totalBurned,
            totalToTreasury: settlementStats.totalToTreasury,
            pendingSettlement: settlementStats.pendingSettlement,
        });
    }
    catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
}));
/**
 * POST /api/token/deposit
 * Record a token deposit (after on-chain confirmation)
 */
router.post('/deposit', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { walletAddress, amount, txHash } = req.body;
        if (!walletAddress || !amount || !txHash) {
            return res.status(400).json({
                error: 'Missing required fields: walletAddress, amount, txHash',
            });
        }
        // Verify transaction on-chain before recording (prevents fake deposits)
        const expectedTokenMint = process.env.TOKEN_MINT_ADDRESS;
        const verification = yield transaction_verifier_service_1.default.verifyDepositTransaction(txHash, walletAddress, parseFloat(amount), expectedTokenMint);
        if (!verification.isValid) {
            return res.status(400).json({
                error: 'Transaction verification failed',
                details: verification.error,
            });
        }
        // Check for duplicate transaction (same txHash already processed)
        const existingTransaction = yield TokenBalance_1.TokenBalance.findOne({
            'transactions.txHash': txHash,
        });
        if (existingTransaction) {
            return res.status(400).json({
                error: 'Transaction has already been processed',
                txHash,
            });
        }
        // Use verified amount from blockchain (more accurate)
        const verifiedAmount = verification.actualAmount || parseFloat(amount);
        const balance = yield balance_tracker_service_1.default.recordDeposit(walletAddress, verifiedAmount, txHash);
        res.json({
            success: true,
            balance: {
                currentBalance: balance.currentBalance,
                depositedAmount: balance.depositedAmount,
            },
        });
    }
    catch (error) {
        console.error('Error recording deposit:', error);
        res.status(500).json({ error: 'Failed to record deposit' });
    }
}));
/**
 * GET /api/token/usage-history/:walletAddress
 * Get usage history for a wallet
 */
router.get('/usage-history/:walletAddress', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { walletAddress } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        if (!walletAddress) {
            return res.status(400).json({ error: 'Wallet address required' });
        }
        const history = yield balance_tracker_service_1.default.getUsageHistory(walletAddress, limit);
        res.json({
            walletAddress,
            history,
            count: history.length,
        });
    }
    catch (error) {
        console.error('Error fetching usage history:', error);
        res.status(500).json({ error: 'Failed to fetch usage history' });
    }
}));
/**
 * GET /api/token/search
 * Search for tokens using Jupiter Ultra API
 */
router.get('/search', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Search query is required' });
        }
        const results = yield jupiter_service_1.default.searchTokens(query);
        res.json(results);
    }
    catch (error) {
        console.error('Error searching tokens:', error);
        res.status(500).json({
            error: 'Failed to search tokens',
            message: error.message
        });
    }
}));
/**
 * POST /api/token/settlement/trigger
 * Manually trigger settlement (admin only)
 */
// Settlement trigger is protected with admin auth and rate limiting
router.post('/settlement/trigger', rateLimit_middleware_1.settlementRateLimiter, auth_middleware_1.verifyAdmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield settlement_service_1.default.triggerManualSettlement();
        res.json({
            success: true,
            message: 'Settlement triggered successfully',
        });
    }
    catch (error) {
        console.error('Error triggering settlement:', error);
        res.status(500).json({ error: 'Failed to trigger settlement' });
    }
}));
exports.default = router;
