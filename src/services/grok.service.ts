import axios from 'axios';

/**
 * Grok Service
 * Handles Grok (xAI) API interactions for chat completions
 */

export interface GrokChatResponse {
    text: string;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    cost: number;
    model: string;
}

export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

class GrokService {
    private apiKey: string | null = null;
    private baseUrl = 'https://api.x.ai/v1';

    constructor() {
        this.apiKey = process.env.GROK_API_KEY || null;
    }

    /**
     * Check if Grok is configured
     */
    isAvailable(): boolean {
        return this.apiKey !== null;
    }

    /**
     * Chat completion using Grok
     * @param messages Array of messages
     * @param model Model to use (default: grok-4-1-fast-non-reasoning)
     * @param maxTokens Maximum tokens in response (default: 500 for cost control)
     * @param temperature Temperature (default: 0.7)
     */
    async chat(
        messages: Message[],
        model: string = 'grok-4-1-fast-non-reasoning',
        maxTokens: number = 500,
        temperature: number = 0.7
    ): Promise<GrokChatResponse> {
        if (!this.apiKey) {
            throw new Error('Grok API key not configured');
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model,
                    messages,
                    max_tokens: maxTokens,
                    temperature,
                    stream: false,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                }
            );

            const choice = response.data.choices[0];
            if (!choice || !choice.message) {
                throw new Error('No response from Grok');
            }

            const usage = response.data.usage || {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            };

            return {
                text: choice.message.content || '',
                usage,
                cost: this.calculateCost(usage, model),
                model: response.data.model || model,
            };
        } catch (error: any) {
            throw new Error(`Grok chat failed: ${error.message}`);
        }
    }

    /**
     * Calculate cost based on token usage and model
     * IMPORTANT: Pricing must be updated from official xAI API documentation
     * Current rates are estimates - verify and update from https://x.ai/pricing
     */
    private calculateCost(
        usage: { prompt_tokens: number; completion_tokens: number },
        model: string
    ): number {
        const rates: Record<string, { input: number; output: number }> = {
            'grok-4-1-fast-reasoning': { input: 2.0, output: 10.0 },
            'grok-4-1-fast-non-reasoning': { input: 1.0, output: 5.0 },
            // Legacy models (fallback)
            'grok-2': { input: 2.0, output: 10.0 },
            'grok-2-mini': { input: 1.0, output: 5.0 },
        };

        const rate = rates[model] || rates['grok-4-1-fast-non-reasoning'];
        const inputCost = (usage.prompt_tokens / 1_000_000) * rate.input;
        const outputCost = (usage.completion_tokens / 1_000_000) * rate.output;
        return inputCost + outputCost;
    }
}

export const grokService = new GrokService();
export default grokService;
