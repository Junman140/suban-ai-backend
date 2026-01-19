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
const llm_service_1 = __importDefault(require("../services/llm.service"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const router = (0, express_1.Router)();
// Chat request cost in USD (default, will be calculated based on actual usage)
const DEFAULT_CHAT_COST_USD = parseFloat(process.env.DEFAULT_CHAT_COST_USD || '0.02');
router.post('/message', rateLimit_middleware_1.chatRateLimiter, auth_middleware_1.verifyWallet, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { message, walletAddress } = req.body;
        const modelTypeParam = req.body.modelType;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        if (!walletAddress) {
            return res.status(400).json({ error: 'Wallet address is required' });
        }
        // Calculate required tokens (using default cost for estimation)
        const requiredTokens = price_oracle_service_1.default.calculateTokenBurn(DEFAULT_CHAT_COST_USD);
        // Check balance
        const hasSufficientBalance = yield balance_tracker_service_1.default.hasSufficientBalance(walletAddress, requiredTokens);
        if (!hasSufficientBalance) {
            const balance = yield balance_tracker_service_1.default.getBalance(walletAddress);
            return res.status(402).json({
                error: 'Insufficient tokens',
                required: requiredTokens,
                available: balance.currentBalance,
                costUsd: DEFAULT_CHAT_COST_USD,
            });
        }
        // Process chat request
        const selectedModelType = (modelTypeParam || 'cheap');
        if (!llm_service_1.default.isModelAvailable(selectedModelType)) {
            return res.status(400).json({
                error: `Model type ${selectedModelType} is not available. Available models: ${llm_service_1.default.getAvailableModels().join(', ')}`,
            });
        }
        const llmResponse = yield llm_service_1.default.generateResponse(message, selectedModelType);
        // Calculate actual cost based on token usage
        // TODO: Use actual cost calculator with real token pricing
        // For now, use default cost
        const actualCostUsd = DEFAULT_CHAT_COST_USD;
        const actualRequiredTokens = price_oracle_service_1.default.calculateTokenBurn(actualCostUsd);
        // Deduct tokens after successful response
        const updatedBalance = yield balance_tracker_service_1.default.deductTokens(walletAddress, actualRequiredTokens, 'chat', actualCostUsd);
        res.json({
            reply: llmResponse.content,
            tokenInfo: {
                cost: actualRequiredTokens,
                costUsd: actualCostUsd,
                remainingBalance: updatedBalance.currentBalance,
                llmUsage: {
                    inputTokens: llmResponse.inputTokens,
                    outputTokens: llmResponse.outputTokens,
                    model: llmResponse.model,
                    provider: llmResponse.provider,
                },
            },
        });
    }
    catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
}));
/**
 * GET /api/chat/cost
 * Get estimated cost for a chat request
 */
const rateLimit_middleware_2 = require("../middleware/rateLimit.middleware");
router.get('/cost', rateLimit_middleware_2.costCalculationRateLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const modelType = (req.query.modelType || 'cheap');
        // Use default cost for now - will be replaced with actual calculation in Phase 3
        const costUsd = DEFAULT_CHAT_COST_USD;
        const requiredTokens = price_oracle_service_1.default.calculateTokenBurn(costUsd);
        const tokenPrice = price_oracle_service_1.default.getTWAPPrice();
        res.json({
            costUsd,
            costTokens: requiredTokens,
            tokenPrice,
            modelType,
            availableModels: llm_service_1.default.getAvailableModels(),
        });
    }
    catch (error) {
        console.error('Error calculating cost:', error);
        res.status(500).json({ error: 'Failed to calculate cost' });
    }
}));
exports.default = router;
