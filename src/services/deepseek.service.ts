import axios from 'axios';

/**
 * DeepSeek Service
 * Handles DeepSeek API interactions for text-based chat only
 * Voice is handled by Grok Voice Agent WebSocket API
 */

export interface DeepSeekChatResponse {
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

class DeepSeekService {
    private apiKey: string | null = null;
    private baseUrl = 'https://api.deepseek.com/v1';

    constructor() {
        this.apiKey = process.env.DEEPSEEK_API_KEY || null;
    }

    /**
     * Check if DeepSeek is configured
     */
    isAvailable(): boolean {
        return this.apiKey !== null;
    }

    /**
     * Chat completion using DeepSeek
     * @param messages Array of messages
     * @param model Model to use (default: deepseek-chat)
     * @param maxTokens Maximum tokens in response (default: 500 for cost control)
     * @param temperature Temperature (default: 0.7)
     */
    async chat(
        messages: Message[],
        model: string = 'deepseek-chat',
        maxTokens: number = 500,
        temperature: number = 0.7
    ): Promise<DeepSeekChatResponse> {
        if (!this.apiKey) {
            throw new Error('DeepSeek API key not configured');
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
                throw new Error('No response from DeepSeek');
            }

            const usage = response.data.usage || {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            };

            return {
                text: choice.message.content || '',
                usage,
                cost: this.calculateCost(usage),
                model: response.data.model || model,
            };
        } catch (error: any) {
            throw new Error(`DeepSeek chat failed: ${error.message}`);
        }
    }

    /**
     * Calculate cost based on token usage
     * DeepSeek V3 pricing: $0.27/M input tokens, $1.10/M output tokens
     */
    private calculateCost(usage: { prompt_tokens: number; completion_tokens: number }): number {
        const inputCost = (usage.prompt_tokens / 1_000_000) * 0.27;
        const outputCost = (usage.completion_tokens / 1_000_000) * 1.10;
        return inputCost + outputCost;
    }
}

export const deepseekService = new DeepSeekService();
export default deepseekService;
