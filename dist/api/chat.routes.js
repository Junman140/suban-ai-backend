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
const tokenMeter_service_1 = __importDefault(require("../services/tokenMeter.service"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const costCalculator_1 = require("../utils/costCalculator");
const router = (0, express_1.Router)();
// Free tier limits
const FREE_TIER_DAILY_LIMIT = 5;
/**
 * POST /api/chat/message
 * Send a chat message and get AI response
 */
router.post('/message', rateLimit_middleware_1.chatRateLimiter, auth_middleware_1.verifyWallet, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { message, walletAddress, userTier, conversationHistory, userId } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        if (!walletAddress) {
            return res.status(400).json({ error: 'Wallet address is required' });
        }
        // Check if user is admin (admins bypass token checks for testing)
        const isAdmin = yield (0, auth_middleware_1.isAdminUser)(walletAddress);
        // Determine user tier (default to free)
        const tier = userTier || 'free';
        // Check free tier limits (skip for admin users)
        if (tier === 'free' && !isAdmin) {
            // For free tier, we need a userId to track daily usage
            // If no userId provided, we'll use walletAddress as identifier
            const userIdentifier = userId || walletAddress;
            const hasExceededLimit = yield tokenMeter_service_1.default.hasExceededFreeLimit(userIdentifier);
            if (hasExceededLimit) {
                return res.status(403).json({
                    error: 'Free tier daily limit exceeded',
                    limit: FREE_TIER_DAILY_LIMIT,
                    message: 'You have reached the daily limit of 5 messages. Please upgrade to paid tier for unlimited access.',
                });
            }
        }
        // Estimate cost before making request
        const estimatedCost = (0, costCalculator_1.estimateCost)(500, 500, 'deepseek'); // Rough estimate
        const requiredTokens = price_oracle_service_1.default.calculateTokenBurn(estimatedCost);
        // Check balance (skip for admin users)
        if (!isAdmin) {
            const hasSufficientBalance = yield balance_tracker_service_1.default.hasSufficientBalance(walletAddress, requiredTokens);
            if (!hasSufficientBalance) {
                const balance = yield balance_tracker_service_1.default.getBalance(walletAddress);
                return res.status(402).json({
                    error: 'Insufficient tokens',
                    required: requiredTokens,
                    available: balance.currentBalance,
                    costUsd: estimatedCost,
                });
            }
        }
        // Generate session ID for tracking
        const sessionId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const userIdentifier = userId || walletAddress;
        // Process chat request with intelligent routing
        const llmResponse = yield llm_service_1.default.generateResponse(message, {
            userTier: tier,
            conversationHistory: conversationHistory || [],
            maxTokens: 500, // Cost control
            temperature: 0.7,
        });
        // Calculate actual cost
        const actualCostUsd = llmResponse.cost || estimatedCost;
        const actualRequiredTokens = price_oracle_service_1.default.calculateTokenBurn(actualCostUsd);
        // Record usage
        try {
            yield tokenMeter_service_1.default.recordUsageFromMetrics(userIdentifier, sessionId, 'chat', {
                inputTokens: llmResponse.inputTokens,
                outputTokens: llmResponse.outputTokens,
                provider: llmResponse.provider,
                model: llmResponse.model,
            });
        }
        catch (error) {
            console.error('Failed to record usage:', error);
            // Don't fail the request if usage tracking fails
        }
        // Deduct tokens after successful response (skip for admin users)
        let updatedBalance;
        if (!isAdmin) {
            updatedBalance = yield balance_tracker_service_1.default.deductTokens(walletAddress, actualRequiredTokens, 'chat', actualCostUsd);
        }
        else {
            // For admin users, just get balance without deducting
            updatedBalance = yield balance_tracker_service_1.default.getBalance(walletAddress);
        }
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
                    intent: llmResponse.intent,
                },
            },
            modelInfo: {
                selectedModel: llmResponse.model,
                provider: llmResponse.provider,
                intent: llmResponse.intent,
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
router.get('/cost', rateLimit_middleware_1.costCalculationRateLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userTier = (req.query.userTier || 'free');
        // Estimate cost (will vary based on actual usage, but provide rough estimate)
        const estimatedCost = (0, costCalculator_1.estimateCost)(500, 500, 'deepseek'); // Default to DeepSeek estimate
        const requiredTokens = price_oracle_service_1.default.calculateTokenBurn(estimatedCost);
        const tokenPrice = price_oracle_service_1.default.getTWAPPrice();
        const providers = llm_service_1.default.getAvailableProviders();
        res.json({
            costUsd: estimatedCost,
            costTokens: requiredTokens,
            tokenPrice,
            userTier,
            availableProviders: providers,
            freeTierLimit: FREE_TIER_DAILY_LIMIT,
        });
    }
    catch (error) {
        console.error('Error calculating cost:', error);
        res.status(500).json({ error: 'Failed to calculate cost' });
    }
}));
exports.default = router;
