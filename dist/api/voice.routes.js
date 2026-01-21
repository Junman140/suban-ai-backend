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
const express_1 = require("express");
const balance_tracker_service_1 = __importDefault(require("../services/solana/balance-tracker.service"));
const price_oracle_service_1 = __importDefault(require("../services/solana/price-oracle.service"));
const voice_service_1 = __importDefault(require("../services/voice.service"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const rateLimit_middleware_1 = require("../middleware/rateLimit.middleware");
const router = (0, express_1.Router)();
// Max voice session duration: 3 minutes
const MAX_SESSION_DURATION_MS = 180000;
const ESTIMATED_VOICE_SESSION_COST_USD = 0.10; // Estimated cost per 3-minute session
/**
 * POST /api/voice/session
 * Create a new Grok Voice Agent session
 * All voice interactions use Grok Voice Agent WebSocket API
 */
router.post('/session', rateLimit_middleware_1.voiceRateLimiter, auth_middleware_1.verifyWallet, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { walletAddress, userId, voice, model, systemInstructions, temperature } = req.body;
        const userWallet = walletAddress || req.walletAddress;
        const userIdentifier = userId || userWallet;
        if (!voice_service_1.default.isAvailable()) {
            return res.status(503).json({
                error: 'Voice service not configured',
                message: 'Grok Voice Agent requires GROK_API_KEY to be set'
            });
        }
        // Check if user is admin (admins bypass token checks for testing)
        const isAdmin = yield (0, auth_middleware_1.isAdminUser)(userWallet);
        // Estimate cost for voice session
        const requiredTokens = price_oracle_service_1.default.calculateTokenBurn(ESTIMATED_VOICE_SESSION_COST_USD);
        // Check balance (skip for admin users)
        if (!isAdmin) {
            const hasSufficientBalance = yield balance_tracker_service_1.default.hasSufficientBalance(userWallet, requiredTokens);
            if (!hasSufficientBalance) {
                const balance = yield balance_tracker_service_1.default.getBalance(userWallet);
                return res.status(402).json({
                    error: 'Insufficient tokens',
                    required: requiredTokens,
                    available: balance.currentBalance,
                    costUsd: ESTIMATED_VOICE_SESSION_COST_USD,
                });
            }
        }
        // Create voice session
        const session = yield voice_service_1.default.createSession({
            model: model || 'grok-4-1-fast-non-reasoning',
            voice: voice || 'Ara',
            systemInstructions: systemInstructions || '',
            temperature: temperature || 0.7,
        });
        res.json({
            sessionId: session.sessionId,
            message: 'Voice session created. Connect via WebSocket to /api/voice/ws/:sessionId',
            wsUrl: `/api/voice/ws/${session.sessionId}`,
            maxDuration: MAX_SESSION_DURATION_MS / 1000, // seconds
            estimatedCost: ESTIMATED_VOICE_SESSION_COST_USD,
        });
    }
    catch (error) {
        console.error('Voice session creation error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
}));
/**
 * GET /api/voice/session/:sessionId
 * Get session information
 */
router.get('/session/:sessionId', auth_middleware_1.verifyWallet, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { sessionId } = req.params;
        const sessionInfo = voice_service_1.default.getSessionInfo(sessionId);
        if (!sessionInfo) {
            return res.status(404).json({ error: 'Session not found' });
        }
        const isValid = voice_service_1.default.isSessionValid(sessionId);
        res.json(Object.assign(Object.assign({}, sessionInfo), { isValid, maxDuration: MAX_SESSION_DURATION_MS / 1000, remainingTime: isValid ? (MAX_SESSION_DURATION_MS - sessionInfo.duration) / 1000 : 0 }));
    }
    catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
}));
/**
 * DELETE /api/voice/session/:sessionId
 * Close a voice session
 */
router.delete('/session/:sessionId', auth_middleware_1.verifyWallet, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { sessionId } = req.params;
        yield voice_service_1.default.closeSession(sessionId);
        res.json({
            message: 'Session closed',
            sessionId,
        });
    }
    catch (error) {
        console.error('Close session error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
}));
/**
 * GET /api/voice/cost
 * Get estimated cost for a voice session
 */
router.get('/cost', rateLimit_middleware_1.costCalculationRateLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const requiredTokens = price_oracle_service_1.default.calculateTokenBurn(ESTIMATED_VOICE_SESSION_COST_USD);
        const tokenPrice = price_oracle_service_1.default.getTWAPPrice();
        res.json({
            costUsd: ESTIMATED_VOICE_SESSION_COST_USD,
            costTokens: requiredTokens,
            tokenPrice,
            serviceAvailable: voice_service_1.default.isAvailable(),
            maxSessionDuration: MAX_SESSION_DURATION_MS / 1000, // seconds
            note: 'All voice interactions use Grok Voice Agent WebSocket API',
        });
    }
    catch (error) {
        console.error('Error calculating cost:', error);
        res.status(500).json({ error: 'Failed to calculate cost' });
    }
}));
exports.default = router;
// Note: WebSocket endpoint would be handled separately in the main server file
// This would typically be set up with express-ws or similar:
// 
// import expressWs from 'express-ws';
// const { app } = expressWs(express());
// 
// app.ws('/api/voice/ws/:sessionId', async (ws, req) => {
//     const { sessionId } = req.params;
//     const session = voiceService.getSession(sessionId);
//     
//     if (!session) {
//         ws.close(1008, 'Session not found');
//         return;
//     }
//     
//     // Forward WebSocket messages between client and Grok Voice Agent
//     session.on('audio', (audioBuffer) => {
//         ws.send(JSON.stringify({ type: 'audio', data: audioBuffer.toString('base64') }));
//     });
//     
//     session.on('transcript', (text) => {
//         ws.send(JSON.stringify({ type: 'transcript', text }));
//     });
//     
//     session.on('response_done', () => {
//         ws.send(JSON.stringify({ type: 'response_done' }));
//     });
//     
//     ws.on('message', (message) => {
//         try {
//             const data = JSON.parse(message.toString());
//             if (data.type === 'audio') {
//                 session.sendAudio(Buffer.from(data.data, 'base64'));
//             } else if (data.type === 'text') {
//                 session.sendText(data.text);
//             }
//         } catch (error) {
//             console.error('WebSocket message error:', error);
//         }
//     });
//     
//     ws.on('close', () => {
//         session.close().catch(console.error);
//     });
// });
