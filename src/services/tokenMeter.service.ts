import Usage, { IUsage } from '../models/usage.model';
import { calculateUsageCost, UsageMetrics } from '../utils/costCalculator';
import mongoose from 'mongoose';

/**
 * Token Meter Service
 * Tracks all AI usage: input/output tokens for text chat, voice session duration
 * Stores per user, per session in MongoDB
 */

export interface MeteredUsage {
    userId: mongoose.Types.ObjectId | string;
    sessionId: string;
    type: 'chat' | 'voice';
    provider: 'deepseek' | 'grok';
    model: string;
    inputTokens: number;
    outputTokens: number;
    voiceSessionMinutes?: number; // For Grok Voice Agent sessions
    costUSD: number;
    metadata?: Record<string, any>;
}

class TokenMeterService {
    /**
     * Record usage for a request
     */
    async recordUsage(usage: MeteredUsage): Promise<IUsage> {
        try {
            const usageRecord = await Usage.create({
                userId: usage.userId,
                sessionId: usage.sessionId,
                type: usage.type,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                whisperDuration: usage.voiceSessionMinutes ? usage.voiceSessionMinutes * 60 : 0, // Convert to seconds
                ttsCharacters: 0, // Not used - voice handled by Grok Voice Agent
                costUSD: usage.costUSD,
            });

            return usageRecord;
        } catch (error: any) {
            throw new Error(`Failed to record usage: ${error.message}`);
        }
    }

    /**
     * Record usage from metrics
     */
    async recordUsageFromMetrics(
        userId: mongoose.Types.ObjectId | string,
        sessionId: string,
        type: 'chat' | 'voice',
        metrics: UsageMetrics
    ): Promise<IUsage> {
        const costUSD = calculateUsageCost(metrics);

        return this.recordUsage({
            userId,
            sessionId,
            type,
            provider: metrics.provider,
            model: metrics.model || (metrics.provider === 'deepseek' ? 'deepseek-chat' : 'grok-4-1-fast-non-reasoning'),
            inputTokens: metrics.inputTokens,
            outputTokens: metrics.outputTokens,
            voiceSessionMinutes: metrics.voiceSessionMinutes,
            costUSD,
        });
    }

    /**
     * Get usage for a user
     */
    async getUserUsage(
        userId: mongoose.Types.ObjectId | string,
        startDate?: Date,
        endDate?: Date
    ): Promise<IUsage[]> {
        const query: any = { userId };
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = startDate;
            if (endDate) query.createdAt.$lte = endDate;
        }

        return Usage.find(query).sort({ createdAt: -1 });
    }

    /**
     * Get usage for a session
     */
    async getSessionUsage(sessionId: string): Promise<IUsage[]> {
        return Usage.find({ sessionId }).sort({ createdAt: 1 });
    }

    /**
     * Get total cost for a user
     */
    async getUserTotalCost(
        userId: mongoose.Types.ObjectId | string,
        startDate?: Date,
        endDate?: Date
    ): Promise<number> {
        const usage = await this.getUserUsage(userId, startDate, endDate);
        return usage.reduce((total, record) => total + record.costUSD, 0);
    }

    /**
     * Get total cost for a session
     */
    async getSessionTotalCost(sessionId: string): Promise<number> {
        const usage = await this.getSessionUsage(sessionId);
        return usage.reduce((total, record) => total + record.costUSD, 0);
    }

    /**
     * Get usage statistics for a user
     */
    async getUserStats(
        userId: mongoose.Types.ObjectId | string,
        startDate?: Date,
        endDate?: Date
    ): Promise<{
        totalRequests: number;
        totalCostUSD: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        totalVoiceSessionMinutes: number;
        byProvider: Record<string, { requests: number; cost: number }>;
    }> {
        const usage = await this.getUserUsage(userId, startDate, endDate);

        const stats = {
            totalRequests: usage.length,
            totalCostUSD: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalVoiceSessionMinutes: 0,
            byProvider: {} as Record<string, { requests: number; cost: number }>,
        };

        usage.forEach((record) => {
            stats.totalCostUSD += record.costUSD;
            stats.totalInputTokens += record.inputTokens;
            stats.totalOutputTokens += record.outputTokens;
            stats.totalVoiceSessionMinutes += record.whisperDuration / 60; // Convert to minutes (used for voice sessions)

            // Track by provider (would need to add provider field to model)
            // For now, aggregate by type
            const key = record.type;
            if (!stats.byProvider[key]) {
                stats.byProvider[key] = { requests: 0, cost: 0 };
            }
            stats.byProvider[key].requests += 1;
            stats.byProvider[key].cost += record.costUSD;
        });

        return stats;
    }

    /**
     * Get daily usage count for a user (for free tier limits)
     */
    async getDailyUsageCount(userId: mongoose.Types.ObjectId | string): Promise<number> {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const count = await Usage.countDocuments({
            userId,
            createdAt: { $gte: startOfDay },
        });

        return count;
    }

    /**
     * Check if user has exceeded free tier limit
     */
    async hasExceededFreeLimit(userId: mongoose.Types.ObjectId | string): Promise<boolean> {
        const dailyCount = await this.getDailyUsageCount(userId);
        const FREE_TIER_LIMIT = 5; // 5 messages per day
        return dailyCount >= FREE_TIER_LIMIT;
    }
}

export const tokenMeterService = new TokenMeterService();
export default tokenMeterService;
