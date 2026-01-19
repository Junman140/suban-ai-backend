# AI Implementation Architecture

## Overview

The Justin Lee AI backend uses a dual-provider AI architecture with **DeepSeek** and **Grok (xAI)** as the exclusive AI service providers. The system implements intelligent routing, cost control, and comprehensive usage tracking to deliver cost-efficient AI services while maintaining high-quality responses.

## Core Principles

### AI Boundaries (Non-Negotiable)

**The AI DOES:**
- Explain charts (RSI, MACD, trends, support/resistance)
- Discuss scenarios and probabilities
- Help users emotionally process losses and act as a discussion partner
- Assist in getting information from X (Twitter)
- Teach risk management concepts

**The AI DOES NOT:**
- Say "buy", "sell", "enter now"
- Predict exact prices
- Act as a financial advisor

### Cost Guardrails

- **Max voice session length**: 2-3 minutes
- **Max response length**: 120-180 words (enforced at 150 words)
- **Max output tokens**: 500 tokens per response
- **Context window policy**: Aggressive truncation (keeps last 4 conversation turns)
- **Free tier limits**: 5 messages per day
- **Model routing**: DeepSeek for cost efficiency, Grok for complex analysis

## Architecture

### Service Layer Structure

```
src/services/
├── deepseek.service.ts      # DeepSeek API integration (text chat only)
├── grok.service.ts          # Grok chat API integration (text chat only)
├── grok-voice.service.ts   # Grok Voice Agent WebSocket API (all voice)
├── llm.service.ts          # Main LLM orchestration service
├── voice.service.ts        # Voice session management (Grok Voice Agent wrapper)
└── tokenMeter.service.ts   # Usage tracking and cost metering
```

### Utility Layer

```
src/utils/
├── modelRouter.ts          # Intelligent model selection
├── promptBuilder.ts        # Prompt construction with guardrails
└── costCalculator.ts       # Cost calculation with actual pricing
```

## AI Providers

### DeepSeek

**Base URL**: `https://api.deepseek.com/v1`

**Models**:
- `deepseek-chat`: Standard chat model (V3.2)
- `deepseek-reasoner`: Thinking mode model (V3.2)

**Pricing**:
- **LLM Input**: $0.27 per million tokens
- **LLM Output**: $1.10 per million tokens

**Use Cases**:
- Default for free tier users
- Simple intents (basic questions, chart explanations, emotional support)
- Cost-efficient text-based chat operations

**API Endpoints**:
- Chat: `POST /chat/completions`

### Grok (xAI)

**Base URL**: `https://api.x.ai/v1`

**Models**:
- `grok-4-1-fast-reasoning`: Advanced reasoning model for complex analysis
- `grok-4-1-fast-non-reasoning`: Fast non-reasoning model for quick responses

**Pricing** (verify from https://x.ai/pricing):
- **grok-4-1-fast-reasoning**:
  - Input: $2.0 per million tokens
  - Output: $10.0 per million tokens
- **grok-4-1-fast-non-reasoning**:
  - Input: $1.0 per million tokens
  - Output: $5.0 per million tokens

**Use Cases**:
- Complex intents (multi-indicator analysis, scenario modeling, risk assessment)
- X (Twitter) search requests
- Paid tier users only

**API Endpoints**:
- Chat: `POST /chat/completions`
- Voice Agent: `wss://api.x.ai/v1/realtime` (WebSocket - handles STT, LLM, TTS)

## Intelligent Model Routing

### Intent Detection

The system uses keyword-based intent detection to route requests to the appropriate model:

**Complex Intents** (require Grok):
- `multi_indicator_analysis`: Multiple technical indicators mentioned
- `deep_scenario_modeling`: Scenario analysis, probability questions
- `advanced_risk_assessment`: Risk analysis requests
- `x_search_request`: X/Twitter search requests

**Simple Intents** (use DeepSeek):
- `basic_question`: General questions
- `emotional_support`: Emotional processing requests
- `chart_explanation`: Single indicator or chart explanations

### Routing Logic

```typescript
if (userTier === 'free') {
    return 'deepseek-v3'; // Always DeepSeek for free users
}

if (complexIntents.includes(intent)) {
    return 'grok-4-1-fast-reasoning'; // Grok reasoning for complex tasks
}

return 'deepseek-v3'; // DeepSeek for simple intents (cost efficiency)
```

### Routing Flow

1. User sends message
2. `modelRouter.ts` detects intent from message content
3. Router selects model based on:
   - User tier (free → DeepSeek, paid → conditional)
   - Intent complexity (complex → Grok, simple → DeepSeek)
4. `llm.service.ts` calls appropriate service
5. Response is truncated and validated
6. Usage is tracked via `tokenMeter.service.ts`

## Voice Processing

### Grok Voice Agent (All Voice Interactions)

**Implementation**: WebSocket-based bidirectional audio streaming

**Architecture**: All voice interactions (STT, LLM, TTS) are handled by Grok Voice Agent in a single real-time session. This simplifies the architecture and provides better latency.

**Features**:
- Real-time voice conversations
- Automatic speech-to-text (STT)
- LLM processing within the same session
- Automatic text-to-speech (TTS)
- Multiple voice personalities (Ara, Rex, Sal, Eve, Leo)
- Tool calling support
- Multilingual support (100+ languages)
- Low latency WebSocket communication

**Service**: `grok-voice.service.ts`
**Endpoint**: `wss://api.x.ai/v1/realtime`

**Session Management**:
- Max duration: 3 minutes
- Auto-close on timeout
- Reconnection support (max 3 attempts)
- Session tracking for cost control

**Pricing**: Estimated ~$0.10 per 3-minute session (verify from xAI pricing)

## Cost Control & Tracking

### Cost Calculation

All costs are calculated in real-time based on actual usage:

**LLM Costs** (Text Chat):
```typescript
inputCost = (inputTokens / 1_000_000) * inputRate
outputCost = (outputTokens / 1_000_000) * outputRate
totalCost = inputCost + outputCost
```

**Voice Session Costs** (Grok Voice Agent):
```typescript
// Estimated pricing (verify from xAI)
cost = (sessionDurationMinutes / 3) * 0.10
// Note: Grok Voice Agent handles STT, LLM, and TTS in one session
```

### Usage Tracking

**Service**: `tokenMeter.service.ts`

**Tracks**:
- Input/output tokens per request (text chat)
- Voice session minutes (Grok Voice Agent)
- Model used
- Provider used
- Total cost in USD
- Per user, per session

**Storage**: MongoDB (`Usage` collection)

### Cost Guardrails

**Response Limits**:
- Max words: 150 (enforced in prompt)
- Max tokens: 500 output tokens
- Context truncation: Last 4 conversation turns

**Session Limits**:
- Max voice session: 3 minutes
- Idle timeout: 2 minutes
- Free tier: 5 messages/day

**Prompt Constraints**:
- Analyst language only (no certainty)
- Scenario framing (not predictions)
- No buy/sell language
- Educational focus

## Prompt Engineering

### System Prompt Structure

**Base Prompt**:
```
You are Justin Lee AI, a personal analyst specializing in:
- Chart scenarios and technical analysis
- Emotional processing and trading psychology
- Risk management strategies
- Market structure analysis

You provide educational insights and emotional support. 
You do NOT provide financial advice, predict prices, or tell users to buy/sell.
```

**Cost Guardrails Added**:
- Maximum 150 words per response
- Use analyst language, not certainty
- Frame as scenarios, not predictions
- Never use "buy/sell" language

**Service**: `promptBuilder.ts`

## API Integration

### Chat Flow

```
User Request
  ↓
POST /api/chat/message
  ↓
llm.service.ts (intelligent routing)
  ↓
modelRouter.ts (intent detection)
  ↓
deepseek.service.ts OR grok.service.ts
  ↓
promptBuilder.ts (add guardrails)
  ↓
API Call (DeepSeek/Grok)
  ↓
Response truncation
  ↓
tokenMeter.service.ts (track usage)
  ↓
Balance deduction
  ↓
Response to user
```

### Voice Flow (Grok Voice Agent)

```
User connects
  ↓
POST /api/voice/session
  ↓
voice.service.ts creates Grok Voice Agent session
  ↓
WebSocket connection to xAI
  ↓
Bidirectional audio streaming
  ↓
Grok Voice Agent handles:
  - STT (automatic)
  - LLM processing (automatic)
  - TTS (automatic)
  ↓
Real-time audio responses
  ↓
Session management (3 min max)
  ↓
Usage tracking on session end
```

## Error Handling & Retries

**Automatic Retries**:
- Rate limit errors (429)
- Network errors (EAI_AGAIN, ETIMEDOUT, ECONNRESET)
- Exponential backoff: 2 seconds

**Error Responses**:
- Clear error messages
- Provider identification
- Cost tracking even on errors (if applicable)

## Environment Configuration

**Required API Keys**:
- `DEEPSEEK_API_KEY`: DeepSeek API key
- `GROK_API_KEY`: Grok (xAI) API key

**Optional Configuration**:
- `DEFAULT_CHAT_COST_USD`: Default chat cost estimate
- `DEFAULT_VOICE_COST_USD`: Default voice session cost estimate (Grok Voice Agent)

## Cost Optimization Strategies

1. **Intelligent Routing**: Use DeepSeek for 90% of text requests (cost-efficient)
2. **Response Limits**: Enforce 150 words max (reduces output tokens)
3. **Context Truncation**: Keep only last 4 turns (reduces input tokens)
4. **Free Tier Limits**: 5 messages/day prevents abuse
5. **Session Timeouts**: 3-minute voice sessions prevent long-running costs
6. **Prompt Optimization**: Concise prompts reduce input tokens
7. **Unified Voice**: Grok Voice Agent handles all voice in one session (simpler, lower latency)

## Monitoring & Analytics

**Usage Metrics Tracked**:
- Total requests per user
- Total cost per user
- Total tokens (input/output) for text chat
- Voice session minutes (Grok Voice Agent)
- Provider distribution
- Model distribution
- Intent distribution

**Available via**:
- `tokenMeter.service.ts` methods
- MongoDB `Usage` collection
- API endpoints for usage history

## Future Enhancements

1. **Advanced Intent Detection**: ML-based intent classification
2. **Caching**: Cache common chart explanations
3. **Streaming Responses**: Real-time token streaming for better UX
4. **Multi-turn Context Optimization**: Smarter context summarization
5. **Voice Session Analytics**: Better tracking of voice session costs and usage patterns

## Pricing Verification

**IMPORTANT**: All pricing must be verified from official sources:

- **DeepSeek**: https://www.deepseek.com/pricing
- **Grok (xAI)**: https://x.ai/pricing

Update `costCalculator.ts` and service files when pricing changes.
