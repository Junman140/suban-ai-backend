# Likable - Solana Token-Gated AI Trading Companion Platform

Likable is a Web3-native **AI trading companion** platform where users pay for AI services using a Solana SPL token. It features dynamic USD-based pricing, 50/50 burn/treasury tokenomics, and multi-wallet support.

## 🌟 Features

- **Token-Gated AI Services**: Pay for chat and voice AI using Solana tokens
- **Dynamic Pricing**: USD-based pricing that automatically converts to tokens using TWAP
- **50/50 Tokenomics**: Half of tokens burned (deflationary), half to treasury (operations)
- **Multi-Wallet Support**: Phantom, Solflare, Backpack, and more
- **Real-Time Balance**: Live token balance and usage tracking
- **Transparent Economics**: Public burn stats and treasury visibility

## 📊 Token Economics

- **Total Supply**: 100,000,000 tokens
- **Decimals**: 6 (matches USDC)
- **Distribution**:
  - 20% Initial Liquidity (Raydium)
  - 30% Treasury (Operations)
  - 50% Ecosystem/Future

- **Pricing**:
  - Chat: $0.02 per request (text-based)
  - Voice: $0.10 per 3-minute session (Grok Voice Agent)
  - Dynamic conversion based on market price

- **Burn Mechanism**:
  - 50% of usage tokens burned
  - 50% to treasury
  - Batch settlement for efficiency

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- MongoDB
- Solana wallet (Phantom recommended)
- **FFmpeg** (optional): For Meme Studio GIF output. Install and ensure it’s on PATH; otherwise the API uses `format: 'video'` for GIF requests and returns `gifUnavailable: true` so you can handle GIF conversion elsewhere.

### Installation

1. **Clone the repository**
```bash
git clone <your-repo>
cd "Likable"
```

2. **Install dependencies**
```bash
# Backend
cd backend
pnpm install

# Frontend
cd ../frontend
pnpm install
```

3. **Configure environment variables**

Backend (`.env`):
```env
# Server Configuration
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/suban_ai

# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
TOKEN_MINT_ADDRESS=<YOUR_TOKEN_ADDRESS>
TREASURY_WALLET_ADDRESS=<YOUR_TREASURY_WALLET>
BACKEND_WALLET_PRIVATE_KEY=<BASE58_ENCODED_PRIVATE_KEY>

# AI API Keys (REQUIRED - at least one)
DEEPSEEK_API_KEY=<your_deepseek_api_key>
GROK_API_KEY=<your_grok_api_key>

# Jupiter API (Optional - for Ultra API endpoint)
JUPITER_API_URL=https://price.jup.ag/v4
JUPITER_API_KEY=<optional_jupiter_api_key>

# Tokenomics Configuration
BURN_FLOOR=0.05
BURN_CEILING=50
TWAP_WINDOW_MINUTES=10

# Cost Configuration (Optional - defaults provided)
DEFAULT_CHAT_COST_USD=0.02
DEFAULT_VOICE_COST_USD=0.10

# Admin Configuration (Optional)
ADMIN_WALLET_ADDRESSES=<comma_separated_admin_addresses>
```

Frontend (`.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

4. **Run the application**

```bash
# Terminal 1 - Backend
cd backend
pnpm dev

# Terminal 2 - Frontend
cd frontend
pnpm dev
```

Visit `http://localhost:3000`

## 📖 Documentation

- **[AI Implementation](./docs/AI.md)** - Complete AI architecture and setup
- **[Implementation Plan](./docs/IMPLEMENTATION.md)** - Full technical specification
- **[Token Launch Guide](./token_launch_guide.md)** - How to create and launch your token

## 🏗️ Architecture

### Backend (`/backend`)

**Core Stack**:
- **Express.js** - REST API server
- **TypeScript** - Type-safe development
- **MongoDB** - User balances, usage tracking, session data
- **Solana Web3.js** - Blockchain interaction
- **Jupiter API** - Token price feeds (TWAP)

**AI Services**:
- **DeepSeek API** - Text-based chat LLM provider (cost-efficient)
- **Grok (xAI) API** - Advanced LLM for complex analysis (text-based)
- **Grok Voice Agent** - Real-time voice interactions via WebSocket (handles STT, LLM, TTS)
- **Intelligent Routing** - Automatic model selection based on intent
- **Cost Control** - Real-time usage tracking and cost calculation

**Key Services**:
- `llm.service.ts` - Main LLM orchestration with intelligent routing
- `deepseek.service.ts` - DeepSeek API integration (text chat only)
- `grok.service.ts` - Grok chat API integration (text chat only)
- `grok-voice.service.ts` - Grok Voice Agent WebSocket integration (all voice)
- `voice.service.ts` - Voice session management (Grok Voice Agent wrapper)
- `tokenMeter.service.ts` - Comprehensive usage tracking
- `modelRouter.ts` - Intent detection and model selection
- `promptBuilder.ts` - Prompt construction with cost guardrails
- `costCalculator.ts` - Real-time cost calculation

**Solana Integration**:
- `balance-tracker.service.ts` - User token balance management
- `price-oracle.service.ts` - TWAP pricing from Jupiter
- `settlement.service.ts` - Batch burn/treasury settlement

### Frontend (`/frontend`)
- **Next.js 16** with App Router
- **Solana Wallet Adapter** for wallet connections
- **Tailwind CSS** for styling
- **Axios** for API calls

### Smart Contracts (To Be Deployed)
- **SPL Token** (100M supply, 6 decimals)
- **Settlement Program** (Anchor) for 50/50 burn/treasury

## 🔑 Key Components

### Backend Services

**AI Services**:
- `deepseek.service.ts` - DeepSeek API (text chat only)
- `grok.service.ts` - Grok chat API (text chat only)
- `grok-voice.service.ts` - Grok Voice Agent WebSocket (all voice interactions)
- `llm.service.ts` - Intelligent LLM routing and orchestration
- `voice.service.ts` - Voice session management (Grok Voice Agent wrapper)
- `tokenMeter.service.ts` - Usage tracking and cost metering

**Utilities**:
- `modelRouter.ts` - Intent detection and model selection
- `promptBuilder.ts` - Prompt construction with guardrails
- `costCalculator.ts` - Real-time cost calculation

**Solana Services**:
- `connection.service.ts` - Solana RPC management
- `price-oracle.service.ts` - TWAP pricing from Jupiter
- `balance-tracker.service.ts` - User balance management
- `settlement.service.ts` - Batch burn/treasury settlement

### Frontend Components
- `WalletProvider.tsx` - Wallet adapter setup
- `TokenBalance.tsx` - Balance display
- `CostEstimate.tsx` - Request cost preview
- `ChatWindow.tsx` - Token-gated chat interface

## 🔐 Security Features

- **TWAP Pricing**: Prevents flash pump/dump exploitation
- **Burn Floor/Ceiling**: Limits extreme price volatility impact
- **Rate Limiting**: Prevents infrastructure abuse
- **No Custody**: Users maintain full control of tokens
- **Transparent Settlement**: All burns are publicly verifiable

## 📊 API Endpoints

### Authentication Routes (`/api/auth`)
- `POST /api/auth/wallet` - Authenticate with wallet address
- `POST /api/auth/verify` - Verify wallet signature

**Request:** `POST /api/auth/wallet`
```json
{
  "walletAddress": "YourWalletAddressHere"
}
```

### Token Routes (`/api/token`)
- `GET /api/token/balance/:walletAddress` - Get user token balance
- `GET /api/token/price` - Get current token price (TWAP)
- `GET /api/token/stats` - Public burn and usage statistics
- `POST /api/token/deposit` - Record token deposit (with on-chain verification)
- `GET /api/token/usage-history/:walletAddress` - Get usage history for a wallet
- `POST /api/token/settlement/trigger` - Manually trigger settlement (Admin only)

**Request:** `POST /api/token/deposit`
```json
{
  "walletAddress": "YourWalletAddress",
  "amount": 100.5,
  "txHash": "TransactionHashHere"
}
```

**Response:** `GET /api/token/price`
```json
{
  "currentPrice": 0.1234,
  "twapPrice": 0.1245,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Chat Routes (`/api/chat`)
- `POST /api/chat/message` - Send chat message with intelligent AI routing
- `GET /api/chat/cost` - Get estimated cost for chat request

**Request:** `POST /api/chat/message`
```json
{
  "message": "Explain RSI and MACD indicators",
  "walletAddress": "YourWalletAddress",
  "userTier": "paid", // or "free"
  "conversationHistory": [
    {"role": "user", "content": "Previous message"},
    {"role": "assistant", "content": "Previous response"}
  ],
  "userId": "optional_user_id"
}
```

**Response:**
```json
{
  "reply": "AI response here (max 150 words)",
  "tokenInfo": {
    "cost": 10.5,
    "costUsd": 0.0005,
    "remainingBalance": 89.5,
    "llmUsage": {
      "inputTokens": 150,
      "outputTokens": 200,
      "model": "deepseek-chat",
      "provider": "deepseek",
      "intent": "multi_indicator_analysis"
    }
  },
  "modelInfo": {
    "selectedModel": "deepseek-chat",
    "provider": "deepseek",
    "intent": "multi_indicator_analysis"
  }
}
```

**Request:** `GET /api/chat/cost?userTier=paid`
**Response:**
```json
{
  "costUsd": 0.0005,
  "costTokens": 10.5,
  "tokenPrice": 0.0019,
  "userTier": "paid",
  "availableProviders": {
    "deepseek": true,
    "grok": true
  },
  "freeTierLimit": 5
}
```

**Intelligent Routing**:
- Free tier users: Always use DeepSeek (cost-efficient)
- Paid tier users: 
  - Complex intents → Grok-4-1-fast-reasoning
  - Simple intents → DeepSeek (cost-efficient)
- Intent detection is automatic based on message content

### Voice Routes (`/api/voice`)
All voice interactions use **Grok Voice Agent WebSocket API** which handles STT, LLM, and TTS in a single real-time session.

- `POST /api/voice/session` - Create Grok Voice Agent session
- `GET /api/voice/session/:sessionId` - Get session info
- `DELETE /api/voice/session/:sessionId` - Close session
- `GET /api/voice/cost` - Get estimated cost for voice session
- `WS /api/voice/ws/:sessionId` - WebSocket connection for real-time voice

**Request:** `POST /api/voice/session`
```json
{
  "walletAddress": "YourWalletAddress",
  "userId": "optional_user_id",
  "voice": "Ara", // Ara, Rex, Sal, Eve, or Leo
  "model": "grok-4-1-fast-non-reasoning",
  "systemInstructions": "Optional system instructions",
  "temperature": 0.7
}
```

**Response:**
```json
{
  "sessionId": "grok-voice-1234567890-abc123",
  "message": "Voice session created. Connect via WebSocket to /api/voice/ws/:sessionId",
  "wsUrl": "/api/voice/ws/grok-voice-1234567890-abc123",
  "maxDuration": 180,
  "estimatedCost": 0.10
}
```

**WebSocket Protocol**:
- Connect to `ws://your-domain/api/voice/ws/:sessionId`
- Send audio: `{"type": "audio", "data": "base64-encoded-audio"}`
- Send text: `{"type": "text", "text": "your text"}`
- Receive audio: `{"type": "audio", "data": "base64-encoded-audio"}`
- Receive transcript: `{"type": "transcript", "text": "transcribed text"}`
- Receive response done: `{"type": "response_done"}`

**Voice Features**:
- Real-time bidirectional audio streaming
- Automatic STT, LLM processing, and TTS in one session
- Max session duration: 3 minutes
- Multiple voice personalities available
- Low latency WebSocket communication

### Error Responses

All endpoints return standard error format:
```json
{
  "error": "Error message",
  "details": "Additional error details (if available)"
}
```

**Common Status Codes:**
- `200` - Success
- `400` - Bad Request (missing/invalid parameters)
- `401` - Unauthorized (wallet auth required)
- `402` - Payment Required (insufficient tokens)
- `403` - Forbidden (admin access required)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

### Rate Limiting

- General API: 100 requests per 15 minutes per IP
- Chat endpoints: 30 requests per minute per wallet
- Voice endpoints: 10 requests per minute per wallet
- Cost calculation: 20 requests per minute
- Settlement trigger: 5 requests per hour (admin only)

## 🏗️ Backend Implementation Details

### Project Structure

```
src/
├── api/                    # Express route handlers
│   ├── auth.routes.ts      # Wallet authentication
│   ├── chat.routes.ts      # Chat endpoints with AI routing
│   ├── voice.routes.ts     # Voice session management (Grok Voice Agent)
│   └── token.routes.ts     # Token balance and settlement
├── services/               # Business logic services
│   ├── deepseek.service.ts # DeepSeek API integration (text chat only)
│   ├── grok.service.ts    # Grok chat API integration (text chat only)
│   ├── grok-voice.service.ts  # Grok Voice Agent WebSocket (all voice)
│   ├── llm.service.ts     # Main LLM orchestration
│   ├── voice.service.ts   # Voice session management wrapper
│   ├── tokenMeter.service.ts  # Usage tracking
│   └── solana/            # Solana blockchain services
│       ├── balance-tracker.service.ts
│       ├── price-oracle.service.ts
│       └── settlement.service.ts
├── utils/                  # Utility functions
│   ├── modelRouter.ts     # Intelligent model selection
│   ├── promptBuilder.ts   # Prompt construction
│   └── costCalculator.ts  # Cost calculation
├── models/                 # MongoDB models
│   ├── user.model.ts
│   └── usage.model.ts
├── middleware/             # Express middleware
│   ├── auth.middleware.ts
│   └── rateLimit.middleware.ts
└── config/                 # Configuration
    └── env.validation.ts
```

### Request Flow

**Chat Request Flow**:
```
1. POST /api/chat/message
2. Middleware: Rate limiting + Wallet verification
3. Check free tier limits (5 messages/day)
4. Estimate cost and check balance
5. llm.service.ts:
   - modelRouter.ts detects intent
   - Selects model (DeepSeek or Grok)
   - promptBuilder.ts adds guardrails
   - Calls appropriate service (deepseek/grok)
6. Truncate response (150 words max)
7. tokenMeter.service.ts records usage
8. Deduct tokens from balance
9. Return response with model info
```

**Voice Request Flow**:
```
1. POST /api/voice/session
2. Middleware: Rate limiting + Wallet verification
3. Check balance
4. voice.service.ts creates Grok Voice Agent session
5. Return session ID and WebSocket URL
6. Client connects via WebSocket
7. Real-time bidirectional audio streaming
8. Grok Voice Agent handles STT, LLM, and TTS automatically
9. Track usage and deduct tokens on session end
```

### AI Model Selection Logic

The system automatically selects the best model based on:

1. **User Tier**:
   - Free: Always DeepSeek (cost control)
   - Paid: Conditional routing

2. **Intent Detection** (automatic):
   - Complex intents → Grok-4-1-fast-reasoning
   - Simple intents → DeepSeek

3. **Complex Intents** (require Grok):
   - Multi-indicator analysis
   - Deep scenario modeling
   - Advanced risk assessment
   - X (Twitter) search requests

### Cost Calculation

All costs are calculated in real-time:

```typescript
// Example: DeepSeek chat request
inputTokens = 150
outputTokens = 200
inputCost = (150 / 1_000_000) * 0.27 = $0.0000405
outputCost = (200 / 1_000_000) * 1.10 = $0.00022
totalCost = $0.0002605

// Convert to tokens using TWAP price
tokenPrice = $0.0019 (from Jupiter)
tokensRequired = $0.0002605 / $0.0019 = 0.137 tokens
```

### Usage Tracking

Every request is tracked in MongoDB:

- User ID / Wallet Address
- Session ID
- Request type (chat/voice)
- Provider (deepseek/grok)
- Model used
- Input/output tokens (text chat)
- Voice session minutes (Grok Voice Agent)
- Total cost in USD
- Timestamp

### Error Handling

- **Rate Limits**: Automatic retry with exponential backoff
- **Network Errors**: Retry once, then fail gracefully
- **Insufficient Balance**: Clear error message with required amount
- **API Errors**: Provider-specific error messages
- **Validation Errors**: Detailed validation feedback

## 🛠️ Development Workflow

1. **Stage 1**: Smart contract development (Anchor)
2. **Stage 2**: Backend token infrastructure ✅
3. **Stage 3**: Frontend wallet integration ✅
4. **Stage 4**: AI integration with DeepSeek & Grok ✅
5. **Stage 5**: Testing & deployment
6. **Stage 6**: Token launch & liquidity

## ⚠️ Important Notes

### AI Configuration

1. **API Keys Required**: At least one of `DEEPSEEK_API_KEY` or `GROK_API_KEY` must be set
2. **Pricing Verification**: Verify all pricing from official sources:
   - DeepSeek: https://www.deepseek.com/pricing
   - Grok: https://x.ai/pricing
3. **Model Selection**: Automatic based on intent detection - no manual selection needed
4. **Cost Control**: Built-in guardrails prevent excessive costs (150 word limit, 500 token limit)

### Token & Blockchain

1. **Token Not Yet Created**: Follow the launch guide to create your token
2. **Free RPC Tier**: Monitor usage, upgrade if needed
3. **Settlement Program**: Placeholder - needs Anchor program deployment
4. **Testing**: Test on devnet before mainnet
5. **Security**: Audit smart contracts before production

### Cost Management

- Free tier: 5 messages/day limit
- Voice sessions: 3-minute maximum
- Response limits: 150 words, 500 tokens enforced
- Context truncation: Last 4 conversation turns only
- Intelligent routing: DeepSeek for 90% of requests (cost-efficient)

## 🔧 Recent Backend Improvements

### MongoDB Graceful Degradation (Latest Update)
- **Connection Monitoring**: Automatic detection of MongoDB connection status
- **Fallback Values**: Returns default balance (0 tokens) when MongoDB is unavailable
- **No Timeouts**: Eliminated 10-second timeout errors - requests return immediately
- **Error Handling**: Clear error messages for database connection issues
- **Service Continuity**: Application continues to function even when database is disconnected

### Error Handling Enhancements
- **Voice Service**: Proper 503 error handling when Grok API key is not configured
- **Balance Endpoints**: Graceful degradation with default values
- **Type Safety**: Fixed TypeScript compilation errors with proper type definitions
- **Error Messages**: User-friendly error messages throughout the API

### Code Quality
- **Type Definitions**: Added `TokenBalanceData` type for plain objects vs Mongoose documents
- **Runtime Checks**: Added `instanceof` checks to ensure Mongoose documents before operations
- **Logging**: Comprehensive logging for debugging without exposing sensitive data

### Admin Testing Support (Latest Update)
- **Admin Users**: Users can be marked as admin in MongoDB to bypass token checks for testing
- **Admin Script**: Easy-to-use script to mark users as admin
- **Dual Check**: Admin status checked from MongoDB first, then falls back to environment variable
- **Token Bypass**: Admin users can use voice and chat services without token balance requirements
- **Testing Ready**: Perfect for testing Grok API with funded API key

## 🧪 Testing Setup

### Making Users Admin

To mark users as admin (bypasses token checks for testing):

**Using npm script:**
```bash
cd backend
pnpm make-admin <walletAddress1> <walletAddress2> ...
```

**Example:**
```bash
pnpm make-admin 22hrGCE1Q2khNo8G2B2hhfnaAxZiwf6AVtoDnRVD2sv8
```

**Direct execution:**
```bash
cd backend
pnpm ts-node scripts/make-admin.ts 22hrGCE1Q2khNo8G2B2hhfnaAxZiwf6AVtoDnRVD2sv8
```

**Multiple users:**
```bash
pnpm make-admin 22hrGCE1Q2khNo8G2B2hhfnaAxZiwf6AVtoDnRVD2sv8 7xKXtg2CZ3qK4gH8vF8vF8vF8vF8vF8vF8vF
```

### Admin Features

- **Token Bypass**: Admin users can use voice and chat services without sufficient token balance
- **Free Tier Bypass**: Admin users bypass free tier daily limits
- **Testing**: Perfect for testing with funded Grok API key
- **Dual Source**: Admin status checked from MongoDB (`isAdmin` field) or environment variable (`ADMIN_WALLET_ADDRESSES`)

### Alternative: Environment Variable (No MongoDB Required)

If MongoDB is not connected, you can still set admin users via environment variable:

**In `.env` file:**
```env
ADMIN_WALLET_ADDRESSES=22hrGCE1Q2khNo8G2B2hhfnaAxZiwf6AVtoDnRVD2sv8,7xKXtg2CZ3qK4gH8vF8vF8vF8vF8vF8vF8vF
```

**Note**: Comma-separated list of wallet addresses. This works even when MongoDB is unavailable.

### MongoDB Connection Issues

If you see `ECONNREFUSED` or `querySrv ECONNREFUSED` errors:

1. **Check MONGODB_URI**: Verify your `.env` file has the correct MongoDB connection string
   - Format: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/database?retryWrites=true&w=majority`
   - Or local: `mongodb://localhost:27017/suban_ai`

2. **Network Access**: 
   - For MongoDB Atlas: Ensure your IP is whitelisted (0.0.0.0/0 for testing, but restrict in production)
   - Check firewall settings
   - Verify DNS resolution works: `nslookup cluster0.aleonke.mongodb.net`

3. **Connection String**: 
   - Verify username and password are correct
   - Check if the database name is correct
   - Ensure special characters in password are URL-encoded

4. **Local MongoDB**: 
   - If using local MongoDB, ensure the service is running
   - Check if MongoDB is listening on the expected port (default: 27017)

5. **Temporary Workaround**:
   - Use environment variable `ADMIN_WALLET_ADDRESSES` to set admin users without MongoDB
   - Application will function with default values (0 balance) when MongoDB is unavailable

**Note**: The application will continue to function with default values (0 balance) when MongoDB is unavailable. Admin users can still be set via environment variable `ADMIN_WALLET_ADDRESSES` even without MongoDB connection.

## 💰 Cost Estimates

### Development & Infrastructure
- **Development**: Completed
- **Token Creation**: ~0.5-2 SOL
- **Raydium Pool**: ~2-3 SOL
- **Initial Liquidity**: Your capital (20M tokens worth)
- **Monthly RPC**: Free tier (upgrade ~$50-200 if needed)
- **Hosting**: ~$10-50/month

### AI Service Costs (Per 1M Tokens)

**DeepSeek** (Text Chat - Cost Efficient):
- Input: $0.27 per million tokens
- Output: $1.10 per million tokens

**Grok** (Text Chat - Complex Analysis):
- grok-4-1-fast-reasoning: $2.0/M input, $10.0/M output
- grok-4-1-fast-non-reasoning: $1.0/M input, $5.0/M output

**Grok Voice Agent** (All Voice Interactions):
- Handles STT, LLM, and TTS in one session
- Estimated: ~$0.10 per 3-minute session (pricing TBD from xAI)

**Typical Request Costs**:
- Simple chat (DeepSeek): ~$0.0003-0.0005 per request
- Complex analysis (Grok): ~$0.002-0.005 per request
- Voice session (Grok Voice Agent): ~$0.10 per 3-minute session

**Cost Optimization**:
- 90% of requests use DeepSeek (cost-efficient)
- Response limits reduce output costs by 60-70%
- Context truncation reduces input costs by 40-50%

## 🤝 Contributing

This is a private project. For questions or issues, contact the development team.

## 📄 License

Proprietary - All rights reserved

## 🔗 Links

- [Solana Documentation](https://docs.solana.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Jupiter Aggregator](https://jup.ag/)
- [Raydium DEX](https://raydium.io/)
