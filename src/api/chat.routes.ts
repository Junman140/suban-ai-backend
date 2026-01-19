import { Router, Request, Response } from 'express';
import balanceTracker from '../services/solana/balance-tracker.service';
import priceOracle from '../services/solana/price-oracle.service';
import llmService from '../services/llm.service';
import tokenMeterService from '../services/tokenMeter.service';
import { verifyWallet } from '../middleware/auth.middleware';
import { chatRateLimiter, costCalculationRateLimiter } from '../middleware/rateLimit.middleware';
import { estimateCost } from '../utils/costCalculator';
import mongoose from 'mongoose';

const router = Router();

// Free tier limits
const FREE_TIER_DAILY_LIMIT = 5;

/**
 * POST /api/chat/message
 * Send a chat message and get AI response
 */
router.post('/message', chatRateLimiter, verifyWallet, async (req: Request, res: Response) => {
    try {
        const { message, walletAddress, userTier, conversationHistory, userId } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!walletAddress) {
            return res.status(400).json({ error: 'Wallet address is required' });
        }

        // Determine user tier (default to free)
        const tier: 'free' | 'paid' = userTier || 'free';

        // Check free tier limits
        if (tier === 'free') {
            // For free tier, we need a userId to track daily usage
            // If no userId provided, we'll use walletAddress as identifier
            const userIdentifier = userId || walletAddress;
            const hasExceededLimit = await tokenMeterService.hasExceededFreeLimit(userIdentifier);
            if (hasExceededLimit) {
                return res.status(403).json({
                    error: 'Free tier daily limit exceeded',
                    limit: FREE_TIER_DAILY_LIMIT,
                    message: 'You have reached the daily limit of 5 messages. Please upgrade to paid tier for unlimited access.',
                });
            }
        }

        // Estimate cost before making request
        const estimatedCost = estimateCost(500, 500, 'deepseek'); // Rough estimate
        const requiredTokens = priceOracle.calculateTokenBurn(estimatedCost);

        // Check balance
        const hasSufficientBalance = await balanceTracker.hasSufficientBalance(
            walletAddress,
            requiredTokens
        );

        if (!hasSufficientBalance) {
            const balance = await balanceTracker.getBalance(walletAddress);
            return res.status(402).json({
                error: 'Insufficient tokens',
                required: requiredTokens,
                available: balance.currentBalance,
                costUsd: estimatedCost,
            });
        }

        // Generate session ID for tracking
        const sessionId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const userIdentifier = userId || walletAddress;

        // Process chat request with intelligent routing
        const llmResponse = await llmService.generateResponse(message, {
            userTier: tier,
            conversationHistory: conversationHistory || [],
            maxTokens: 500, // Cost control
            temperature: 0.7,
        });

        // Calculate actual cost
        const actualCostUsd = llmResponse.cost || estimatedCost;
        const actualRequiredTokens = priceOracle.calculateTokenBurn(actualCostUsd);

        // Record usage
        try {
            await tokenMeterService.recordUsageFromMetrics(
                userIdentifier,
                sessionId,
                'chat',
                {
                    inputTokens: llmResponse.inputTokens,
                    outputTokens: llmResponse.outputTokens,
                    provider: llmResponse.provider,
                    model: llmResponse.model,
                }
            );
        } catch (error) {
            console.error('Failed to record usage:', error);
            // Don't fail the request if usage tracking fails
        }

        // Deduct tokens after successful response
        const updatedBalance = await balanceTracker.deductTokens(
            walletAddress,
            actualRequiredTokens,
            'chat',
            actualCostUsd
        );

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
    } catch (error: any) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

/**
 * GET /api/chat/cost
 * Get estimated cost for a chat request
 */
router.get('/cost', costCalculationRateLimiter, async (req: Request, res: Response) => {
    try {
        const userTier = (req.query.userTier || 'free') as 'free' | 'paid';
        
        // Estimate cost (will vary based on actual usage, but provide rough estimate)
        const estimatedCost = estimateCost(500, 500, 'deepseek'); // Default to DeepSeek estimate
        const requiredTokens = priceOracle.calculateTokenBurn(estimatedCost);
        const tokenPrice = priceOracle.getTWAPPrice();

        const providers = llmService.getAvailableProviders();

        res.json({
            costUsd: estimatedCost,
            costTokens: requiredTokens,
            tokenPrice,
            userTier,
            availableProviders: providers,
            freeTierLimit: FREE_TIER_DAILY_LIMIT,
        });
    } catch (error: any) {
        console.error('Error calculating cost:', error);
        res.status(500).json({ error: 'Failed to calculate cost' });
    }
});

export default router;
