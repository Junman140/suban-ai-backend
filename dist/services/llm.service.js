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
exports.llmService = void 0;
const openai_1 = __importDefault(require("openai"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const axios_1 = __importDefault(require("axios"));
class LLMService {
    constructor() {
        this.openai = null;
        this.claude = null;
        this.grokApiKey = null;
        this.deepseekApiKey = null;
        // System prompt for Justin Lee AI personality
        this.systemPrompt = `You are Justin Lee AI, a personal analyst specializing in:
- Chart scenarios and technical analysis
- Emotional processing and trading psychology
- Risk management strategies
- Market structure analysis

You provide educational insights and emotional support. You do NOT provide financial advice, predict prices, or tell users to buy/sell.
You help users understand market dynamics, manage their emotions, and develop better trading discipline.`;
        // Model routing configuration
        this.modelMap = {
            cheap: null,
            mid: null,
            expensive: null,
        };
        this.initialize();
    }
    initialize() {
        // Initialize OpenAI
        const openaiKey = process.env.OPENAI_API_KEY;
        if (openaiKey) {
            this.openai = new openai_1.default({ apiKey: openaiKey });
        }
        // Initialize Claude
        const claudeKey = process.env.CLAUDE_API_KEY;
        if (claudeKey) {
            this.claude = new sdk_1.default({ apiKey: claudeKey });
        }
        // Initialize Grok (xAI)
        this.grokApiKey = process.env.GROK_API_KEY || null;
        // Initialize DeepSeek
        this.deepseekApiKey = process.env.DEEPSEEK_API_KEY || null;
        // Configure model routing
        this.configureModelRouting();
    }
    configureModelRouting() {
        // Cheap tier: DeepSeek or GPT-3.5
        if (this.deepseekApiKey) {
            this.modelMap.cheap = {
                provider: 'deepseek',
                model: 'deepseek-chat',
                apiKey: this.deepseekApiKey,
            };
        }
        else if (this.openai) {
            this.modelMap.cheap = {
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                apiKey: process.env.OPENAI_API_KEY,
            };
        }
        // Mid tier: Claude Haiku or GPT-4
        if (this.claude) {
            this.modelMap.mid = {
                provider: 'claude',
                model: 'claude-3-haiku-20240307',
                apiKey: process.env.CLAUDE_API_KEY,
            };
        }
        else if (this.openai) {
            this.modelMap.mid = {
                provider: 'openai',
                model: 'gpt-4',
                apiKey: process.env.OPENAI_API_KEY,
            };
        }
        // Expensive tier: Claude Sonnet/Opus or GPT-4 Turbo
        if (this.claude) {
            this.modelMap.expensive = {
                provider: 'claude',
                model: 'claude-3-sonnet-20240229',
                apiKey: process.env.CLAUDE_API_KEY,
            };
        }
        else if (this.openai) {
            this.modelMap.expensive = {
                provider: 'openai',
                model: 'gpt-4-turbo-preview',
                apiKey: process.env.OPENAI_API_KEY,
            };
        }
    }
    generateResponse(prompt_1) {
        return __awaiter(this, arguments, void 0, function* (prompt, modelType = 'cheap') {
            const config = this.modelMap[modelType];
            if (!config) {
                throw new Error(`No ${modelType} model configured. Please set up at least one API key.`);
            }
            // Route to appropriate provider
            try {
                switch (config.provider) {
                    case 'openai':
                        return yield this.callOpenAI(prompt, config);
                    case 'claude':
                        return yield this.callClaude(prompt, config);
                    case 'grok':
                        return yield this.callGrok(prompt, config);
                    case 'deepseek':
                        return yield this.callDeepSeek(prompt, config);
                    default:
                        throw new Error(`Unsupported provider: ${config.provider}`);
                }
            }
            catch (error) {
                // Retry once with exponential backoff
                if (error.status === 429 || error.code === 'rate_limit_exceeded') {
                    yield this.delay(2000);
                    return this.generateResponse(prompt, modelType);
                }
                throw error;
            }
        });
    }
    callOpenAI(prompt, config) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!this.openai) {
                throw new Error('OpenAI client not initialized');
            }
            const response = yield this.openai.chat.completions.create({
                model: config.model,
                messages: [
                    { role: 'system', content: this.systemPrompt },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                max_tokens: 2000,
            });
            const choice = response.choices[0];
            if (!choice || !choice.message) {
                throw new Error('No response from OpenAI');
            }
            return {
                content: choice.message.content || '',
                inputTokens: ((_a = response.usage) === null || _a === void 0 ? void 0 : _a.prompt_tokens) || 0,
                outputTokens: ((_b = response.usage) === null || _b === void 0 ? void 0 : _b.completion_tokens) || 0,
                model: config.model,
                provider: 'openai',
            };
        });
    }
    callClaude(prompt, config) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.claude) {
                throw new Error('Claude client not initialized');
            }
            const response = yield this.claude.messages.create({
                model: config.model,
                max_tokens: 2000,
                system: this.systemPrompt,
                messages: [
                    { role: 'user', content: prompt },
                ],
            });
            const content = response.content[0];
            if (content.type !== 'text') {
                throw new Error('Unexpected response type from Claude');
            }
            return {
                content: content.text,
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                model: config.model,
                provider: 'claude',
            };
        });
    }
    callGrok(prompt, config) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!this.grokApiKey) {
                throw new Error('Grok API key not configured');
            }
            // Grok (xAI) API integration
            // Note: xAI Grok API endpoint structure (adjust based on actual API)
            const response = yield axios_1.default.post('https://api.x.ai/v1/chat/completions', {
                model: 'grok-beta',
                messages: [
                    { role: 'system', content: this.systemPrompt },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                max_tokens: 2000,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.grokApiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            });
            const choice = response.data.choices[0];
            if (!choice || !choice.message) {
                throw new Error('No response from Grok');
            }
            return {
                content: choice.message.content || '',
                inputTokens: ((_a = response.data.usage) === null || _a === void 0 ? void 0 : _a.prompt_tokens) || 0,
                outputTokens: ((_b = response.data.usage) === null || _b === void 0 ? void 0 : _b.completion_tokens) || 0,
                model: 'grok-beta',
                provider: 'grok',
            };
        });
    }
    callDeepSeek(prompt, config) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!this.deepseekApiKey) {
                throw new Error('DeepSeek API key not configured');
            }
            // DeepSeek API integration
            const response = yield axios_1.default.post('https://api.deepseek.com/v1/chat/completions', {
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: this.systemPrompt },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.7,
                max_tokens: 2000,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.deepseekApiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            });
            const choice = response.data.choices[0];
            if (!choice || !choice.message) {
                throw new Error('No response from DeepSeek');
            }
            return {
                content: choice.message.content || '',
                inputTokens: ((_a = response.data.usage) === null || _a === void 0 ? void 0 : _a.prompt_tokens) || 0,
                outputTokens: ((_b = response.data.usage) === null || _b === void 0 ? void 0 : _b.completion_tokens) || 0,
                model: 'deepseek-chat',
                provider: 'deepseek',
            };
        });
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get available model types based on configured providers
     */
    getAvailableModels() {
        const available = [];
        if (this.modelMap.cheap)
            available.push('cheap');
        if (this.modelMap.mid)
            available.push('mid');
        if (this.modelMap.expensive)
            available.push('expensive');
        return available;
    }
    /**
     * Check if a specific model type is available
     */
    isModelAvailable(modelType) {
        return this.modelMap[modelType] !== null;
    }
}
exports.llmService = new LLMService();
exports.default = exports.llmService;
