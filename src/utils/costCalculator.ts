/**
 * Cost Calculator
 * Actual pricing for DeepSeek and Grok services
 */

export const COSTS = {
    // DeepSeek Pricing (Text-based chat only)
    DEEPSEEK_LLM_INPUT_PER_M: 0.27, // $0.27 per million input tokens
    DEEPSEEK_LLM_OUTPUT_PER_M: 1.10, // $1.10 per million output tokens

    // Grok Pricing
    // IMPORTANT: Verify and update pricing from official xAI API documentation at https://x.ai/pricing
    GROK_LLM_INPUT_PER_M: {
        'grok-4-1-fast-reasoning': 2.0, // $2.0 per million input tokens
        'grok-4-1-fast-non-reasoning': 1.0, // $1.0 per million input tokens
        // Legacy models (fallback)
        'grok-2': 2.0,
        'grok-2-mini': 1.0,
    },
    GROK_LLM_OUTPUT_PER_M: {
        'grok-4-1-fast-reasoning': 10.0, // $10.0 per million output tokens
        'grok-4-1-fast-non-reasoning': 5.0, // $5.0 per million output tokens
        // Legacy models (fallback)
        'grok-2': 10.0,
        'grok-2-mini': 5.0,
    },

    // Margin multiplier (2x for token burn calculation)
    MARKUP_MULTIPLIER: 2.0,
};

export interface UsageMetrics {
    inputTokens: number;
    outputTokens: number;
    provider: 'deepseek' | 'grok';
    model?: string; // Required for Grok to determine pricing tier
    voiceSessionMinutes?: number; // For Grok Voice Agent sessions
}

/**
 * Calculate total cost for a usage session
 */
export const calculateUsageCost = (metrics: UsageMetrics): number => {
    let totalCost = 0;

    // LLM cost (text-based chat)
    if (metrics.provider === 'deepseek') {
        const inputCost = (metrics.inputTokens / 1_000_000) * COSTS.DEEPSEEK_LLM_INPUT_PER_M;
        const outputCost = (metrics.outputTokens / 1_000_000) * COSTS.DEEPSEEK_LLM_OUTPUT_PER_M;
        totalCost += inputCost + outputCost;
    } else if (metrics.provider === 'grok') {
        const model = metrics.model || 'grok-4-1-fast-non-reasoning';
        const inputRate = COSTS.GROK_LLM_INPUT_PER_M[model as keyof typeof COSTS.GROK_LLM_INPUT_PER_M] || COSTS.GROK_LLM_INPUT_PER_M['grok-4-1-fast-non-reasoning'];
        const outputRate = COSTS.GROK_LLM_OUTPUT_PER_M[model as keyof typeof COSTS.GROK_LLM_OUTPUT_PER_M] || COSTS.GROK_LLM_OUTPUT_PER_M['grok-4-1-fast-non-reasoning'];
        const inputCost = (metrics.inputTokens / 1_000_000) * inputRate;
        const outputCost = (metrics.outputTokens / 1_000_000) * outputRate;
        totalCost += inputCost + outputCost;
    }

    // Voice session cost (Grok Voice Agent - pricing TBD, estimate based on duration)
    // Note: Grok Voice Agent pricing may be per-minute or per-session
    // Update this when official pricing is available
    if (metrics.voiceSessionMinutes) {
        // Rough estimate: $0.10 per 3-minute session
        // This should be updated with actual Grok Voice Agent pricing
        totalCost += (metrics.voiceSessionMinutes / 3) * 0.10;
    }

    return totalCost;
};

/**
 * Calculate cost with markup for token burn
 */
export const calculateCostWithMarkup = (metrics: UsageMetrics): number => {
    const baseCost = calculateUsageCost(metrics);
    return baseCost * COSTS.MARKUP_MULTIPLIER;
};

/**
 * Estimate cost before making API call
 */
export const estimateCost = (
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
    provider: 'deepseek' | 'grok',
    model?: string
): number => {
    return calculateUsageCost({
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        provider,
        model,
    });
};

