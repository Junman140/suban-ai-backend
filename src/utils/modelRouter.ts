/**
 * Model Router
 * Intelligent model selection based on intent detection and user tier
 */

export type UserTier = 'free' | 'paid';
export type ModelSelection = 'deepseek-v3' | 'grok-4-1-fast-reasoning' | 'grok-4-1-fast-non-reasoning';
export type IntentType =
    | 'basic_question'
    | 'emotional_support'
    | 'chart_explanation'
    | 'multi_indicator_analysis'
    | 'deep_scenario_modeling'
    | 'advanced_risk_assessment'
    | 'x_search_request'
    | 'unknown';

export interface ModelRoutingResult {
    model: ModelSelection;
    provider: 'deepseek' | 'grok';
    intent: IntentType;
    reasoning: string;
}

class ModelRouter {
    // Complex intents that require Grok
    private complexIntents: IntentType[] = [
        'multi_indicator_analysis',
        'deep_scenario_modeling',
        'advanced_risk_assessment',
        'x_search_request',
    ];

    /**
     * Select the appropriate model based on intent and user tier
     */
    selectModel(userMessage: string, userTier: UserTier = 'free'): ModelRoutingResult {
        const intent = this.detectIntent(userMessage);

        // Free users always get DeepSeek (cost control)
        if (userTier === 'free') {
            return {
                model: 'deepseek-v3',
                provider: 'deepseek',
                intent,
                reasoning: `Free tier user. Using DeepSeek for cost efficiency. Detected intent: ${intent}`,
            };
        }

        // Paid users: Use Grok for complex intents, DeepSeek for others
        if (this.complexIntents.includes(intent)) {
            // Use reasoning model for complex analysis
            return {
                model: 'grok-4-1-fast-reasoning',
                provider: 'grok',
                intent,
                reasoning: `Complex intent detected (${intent}). Using Grok-4-1-fast-reasoning for advanced analysis.`,
            };
        }

        // Default to DeepSeek for paid users with simple intents (cost efficiency)
        return {
            model: 'deepseek-v3',
            provider: 'deepseek',
            intent,
            reasoning: `Simple intent (${intent}). Using DeepSeek for cost efficiency.`,
        };
    }

    /**
     * Detect intent from user message
     * Uses keyword matching and pattern detection
     */
    detectIntent(message: string): IntentType {
        const lowerMessage = message.toLowerCase();

        // X search request
        if (
            lowerMessage.includes('search x') ||
            lowerMessage.includes('search twitter') ||
            lowerMessage.includes('what\'s on x') ||
            lowerMessage.includes('trending on')
        ) {
            return 'x_search_request';
        }

        // Multi-indicator analysis
        if (
            (lowerMessage.includes('rsi') && lowerMessage.includes('macd')) ||
            (lowerMessage.includes('multiple indicators') ||
                lowerMessage.includes('all indicators') ||
                lowerMessage.includes('combine indicators')) ||
            (lowerMessage.includes('rsi') && lowerMessage.includes('bollinger')) ||
            (lowerMessage.includes('macd') && lowerMessage.includes('volume'))
        ) {
            return 'multi_indicator_analysis';
        }

        // Deep scenario modeling
        if (
            lowerMessage.includes('scenario') ||
            lowerMessage.includes('what if') ||
            lowerMessage.includes('simulate') ||
            lowerMessage.includes('model') ||
            lowerMessage.includes('probability') ||
            lowerMessage.includes('outcome')
        ) {
            return 'deep_scenario_modeling';
        }

        // Advanced risk assessment
        if (
            lowerMessage.includes('risk assessment') ||
            lowerMessage.includes('risk analysis') ||
            lowerMessage.includes('portfolio risk') ||
            lowerMessage.includes('calculate risk') ||
            lowerMessage.includes('risk management strategy')
        ) {
            return 'advanced_risk_assessment';
        }

        // Chart explanation
        if (
            lowerMessage.includes('explain') ||
            lowerMessage.includes('what does') ||
            lowerMessage.includes('chart') ||
            lowerMessage.includes('indicator') ||
            lowerMessage.includes('rsi') ||
            lowerMessage.includes('macd') ||
            lowerMessage.includes('support') ||
            lowerMessage.includes('resistance')
        ) {
            return 'chart_explanation';
        }

        // Emotional support
        if (
            lowerMessage.includes('feel') ||
            lowerMessage.includes('emotion') ||
            lowerMessage.includes('stressed') ||
            lowerMessage.includes('anxious') ||
            lowerMessage.includes('loss') ||
            lowerMessage.includes('frustrated') ||
            lowerMessage.includes('help me cope')
        ) {
            return 'emotional_support';
        }

        // Basic question (default)
        return 'basic_question';
    }

    /**
     * Check if an intent requires Grok
     */
    requiresGrok(intent: IntentType): boolean {
        return this.complexIntents.includes(intent);
    }
}

export const modelRouter = new ModelRouter();
export default modelRouter;
