/**
 * Prompt Builder
 * Constructs system prompts with cost guardrails and response constraints
 */

export interface PromptConfig {
    maxWords?: number; // Default: 150
    maxTokens?: number; // Default: 500
    enforceAnalystLanguage?: boolean; // Default: true
    preventBuySell?: boolean; // Default: true
    frameAsScenarios?: boolean; // Default: true
}

class PromptBuilder {
    private readonly baseSystemPrompt = `You are Justin Lee AI, a personal analyst specializing in:
- Chart scenarios and technical analysis
- Emotional processing and trading psychology
- Risk management strategies
- Market structure analysis

You provide educational insights and emotional support. You do NOT provide financial advice, predict prices, or tell users to buy/sell.
You help users understand market dynamics, manage their emotions, and develop better trading discipline.`;

    /**
     * Build system prompt with cost guardrails
     */
    buildSystemPrompt(config: PromptConfig = {}): string {
        const {
            maxWords = 150,
            enforceAnalystLanguage = true,
            preventBuySell = true,
            frameAsScenarios = true,
        } = config;

        let prompt = this.baseSystemPrompt;

        // Add response length constraint
        prompt += `\n\nCRITICAL: Keep responses concise. Maximum ${maxWords} words. Be direct and focused.`;

        // Add analyst language enforcement
        if (enforceAnalystLanguage) {
            prompt += `\n\nUse analyst language, not certainty. Frame insights as observations and probabilities, not predictions.`;
        }

        // Add scenario framing
        if (frameAsScenarios) {
            prompt += `\n\nFrame analysis as scenarios and historical patterns, not future guarantees. Use phrases like "typically", "historically", "in similar situations".`;
        }

        // Add buy/sell prevention
        if (preventBuySell) {
            prompt += `\n\nABSOLUTELY FORBIDDEN: Never say "buy", "sell", "enter now", "exit now", or any direct trading instructions. Frame as educational scenarios only.`;
        }

        return prompt;
    }

    /**
     * Build user message with context truncation
     * Summarizes context if it's too long
     */
    buildUserMessage(
        currentMessage: string,
        conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
        maxContextTurns: number = 4
    ): Array<{ role: 'user' | 'assistant'; content: string }> {
        // If history is short, return as-is
        if (conversationHistory.length <= maxContextTurns) {
            return [...conversationHistory, { role: 'user' as const, content: currentMessage }];
        }

        // Truncate: Keep most recent turns
        const recentHistory = conversationHistory.slice(-maxContextTurns);
        return [...recentHistory, { role: 'user' as const, content: currentMessage }];
    }

    /**
     * Truncate response if it exceeds word limit
     */
    truncateResponse(response: string, maxWords: number = 150): string {
        const words = response.split(/\s+/);
        if (words.length <= maxWords) {
            return response;
        }

        // Truncate and add ellipsis
        const truncated = words.slice(0, maxWords).join(' ');
        return truncated + '...';
    }

    /**
     * Count words in text
     */
    countWords(text: string): number {
        return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
    }

    /**
     * Estimate tokens (rough: 1 token ≈ 4 characters)
     */
    estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }
}

export const promptBuilder = new PromptBuilder();
export default promptBuilder;
