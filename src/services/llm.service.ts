import deepseekService from './deepseek.service';
import grokService from './grok.service';
import modelRouter, { UserTier } from '../utils/modelRouter';
import promptBuilder from '../utils/promptBuilder';

/**
 * LLM Service
 * Routes requests to DeepSeek or Grok based on intelligent intent detection
 * Uses prompt builder for cost guardrails
 */

export interface LLMResponse {
    content: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
    provider: 'grok' | 'deepseek';
    intent?: string;
    cost?: number;
}

export interface GenerateResponseOptions {
    userTier?: UserTier;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
    temperature?: number;
}

class LLMService {
    private readonly MAX_OUTPUT_TOKENS = 500; // Cost control
    private readonly MAX_RESPONSE_WORDS = 150; // Cost control

    constructor() {
        // Services are initialized via their constructors
    }

    /**
     * Generate response using intelligent routing
     */
    async generateResponse(
        prompt: string,
        options: GenerateResponseOptions = {}
    ): Promise<LLMResponse> {
        const {
            userTier = 'free',
            conversationHistory = [],
            maxTokens = this.MAX_OUTPUT_TOKENS,
            temperature = 0.7,
        } = options;

        // Intelligent model selection based on intent
        const routing = modelRouter.selectModel(prompt, userTier);

        // Build system prompt with cost guardrails
        const systemPrompt = promptBuilder.buildSystemPrompt({
            maxWords: this.MAX_RESPONSE_WORDS,
            maxTokens,
            enforceAnalystLanguage: true,
            preventBuySell: true,
            frameAsScenarios: true,
        });

        // Build messages with context truncation
        const messages = [
            { role: 'system' as const, content: systemPrompt },
            ...promptBuilder.buildUserMessage(prompt, conversationHistory),
        ];

        try {
            let response: LLMResponse;

            if (routing.provider === 'deepseek') {
                const deepseekResponse = await deepseekService.chat(
                    messages,
                    'deepseek-chat',
                    maxTokens,
                    temperature
                );

                response = {
                    content: promptBuilder.truncateResponse(deepseekResponse.text, this.MAX_RESPONSE_WORDS),
                    inputTokens: deepseekResponse.usage.prompt_tokens,
                    outputTokens: deepseekResponse.usage.completion_tokens,
                    model: deepseekResponse.model,
                    provider: 'deepseek',
                    intent: routing.intent,
                    cost: deepseekResponse.cost,
                };
            } else {
                // Grok - use the model selected by router (grok-4-1-fast-reasoning or grok-4-1-fast-non-reasoning)
                const grokModel = routing.model === 'grok-4-1-fast-reasoning' 
                    ? 'grok-4-1-fast-reasoning' 
                    : 'grok-4-1-fast-non-reasoning';
                
                const grokResponse = await grokService.chat(
                    messages,
                    grokModel,
                    maxTokens,
                    temperature
                );

                response = {
                    content: promptBuilder.truncateResponse(grokResponse.text, this.MAX_RESPONSE_WORDS),
                    inputTokens: grokResponse.usage.prompt_tokens,
                    outputTokens: grokResponse.usage.completion_tokens,
                    model: grokResponse.model,
                    provider: 'grok',
                    intent: routing.intent,
                    cost: grokResponse.cost,
                };
            }

            return response;
        } catch (error: any) {
            // Retry once with exponential backoff for rate limits
            if (
                error.status === 429 ||
                error.code === 'rate_limit_exceeded' ||
                error.code === 'EAI_AGAIN' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNRESET'
            ) {
                console.log(`Retrying due to error: ${error.code || error.status}`);
                await this.delay(2000);
                return this.generateResponse(prompt, options);
            }
            throw error;
        }
    }

    /**
     * Legacy method for backward compatibility
     * @deprecated Use generateResponse with options instead
     */
    async generateResponseLegacy(
        prompt: string,
        modelType: 'cheap' | 'mid' | 'expensive' = 'cheap'
    ): Promise<LLMResponse> {
        // Map legacy model types to user tiers
        const userTier: UserTier = modelType === 'expensive' ? 'paid' : 'free';
        return this.generateResponse(prompt, { userTier });
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Get available providers
     */
    getAvailableProviders(): { deepseek: boolean; grok: boolean } {
        return {
            deepseek: deepseekService.isAvailable(),
            grok: grokService.isAvailable(),
        };
    }

    /**
     * Check if service is available
     */
    isAvailable(): boolean {
        const providers = this.getAvailableProviders();
        return providers.deepseek || providers.grok;
    }

    /**
     * Legacy method for backward compatibility
     * @deprecated Use getAvailableProviders instead
     */
    getAvailableModels(): string[] {
        const providers = this.getAvailableProviders();
        const available: string[] = [];
        if (providers.deepseek || providers.grok) {
            available.push('cheap', 'mid', 'expensive'); // Legacy compatibility
        }
        return available;
    }

    /**
     * Legacy method for backward compatibility
     * @deprecated Models are now selected intelligently
     */
    isModelAvailable(modelType: 'cheap' | 'mid' | 'expensive'): boolean {
        return this.isAvailable();
    }
}

export const llmService = new LLMService();
export default llmService;
