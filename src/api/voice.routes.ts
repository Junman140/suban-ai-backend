import { Router, Request, Response } from 'express';
import balanceTracker from '../services/solana/balance-tracker.service';
import priceOracle from '../services/solana/price-oracle.service';
import voiceService from '../services/voice.service';
import { verifyWallet, isAdminUser } from '../middleware/auth.middleware';
import { voiceRateLimiter, costCalculationRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Max voice session duration: 3 minutes
const MAX_SESSION_DURATION_MS = 180000;
const ESTIMATED_VOICE_SESSION_COST_USD = 0.10; // Estimated cost per 3-minute session

/**
 * POST /api/voice/session
 * Create a new Grok Voice Agent session
 * All voice interactions use Grok Voice Agent WebSocket API
 */
router.post('/session', voiceRateLimiter, verifyWallet, async (req: Request, res: Response) => {
    try {
        const { walletAddress, userId, voice, model, systemInstructions, temperature } = req.body;
        const userWallet = walletAddress || req.walletAddress!;
        const userIdentifier = userId || userWallet;

        if (!voiceService.isAvailable()) {
            return res.status(503).json({ 
                error: 'Voice service not configured',
                message: 'Grok Voice Agent requires GROK_API_KEY to be set'
            });
        }

        // Check if user is admin (admins bypass token checks for testing)
        const isAdmin = await isAdminUser(userWallet);

        // Check balance (skip for admin users)
        if (!isAdmin) {
            // Estimate cost for voice session (only for non-admin users)
            let requiredTokens;
            try {
                requiredTokens = priceOracle.calculateTokenBurn(ESTIMATED_VOICE_SESSION_COST_USD);
            } catch (error: any) {
                // If price oracle is unavailable, return error
                console.error('Price oracle error:', error);
                return res.status(503).json({
                    error: 'Price service unavailable',
                    message: 'Unable to calculate token cost. Please try again later.',
                });
            }

            const hasSufficientBalance = await balanceTracker.hasSufficientBalance(
                userWallet,
                requiredTokens
            );

            if (!hasSufficientBalance) {
                const balance = await balanceTracker.getBalance(userWallet);
                return res.status(402).json({
                    error: 'Insufficient tokens',
                    required: requiredTokens,
                    available: balance.currentBalance,
                    costUsd: ESTIMATED_VOICE_SESSION_COST_USD,
                });
            }
        }

        // Create voice session
        console.log('🎤 Creating Grok Voice session...');
        const session = await voiceService.createSession({
            model: model || 'grok-4-1-fast-non-reasoning',
            voice: voice || 'Ara',
            systemInstructions: systemInstructions || '',
            temperature: temperature || 0.7,
        });

        console.log('✅ Grok Voice session created:', session.sessionId);

        res.json({
            sessionId: session.sessionId,
            message: 'Voice session created. Connect via WebSocket to /api/voice/ws/:sessionId',
            wsUrl: `/api/voice/ws/${session.sessionId}`,
            maxDuration: MAX_SESSION_DURATION_MS / 1000, // seconds
            estimatedCost: ESTIMATED_VOICE_SESSION_COST_USD,
        });
    } catch (error: any) {
        console.error('Voice session creation error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

/**
 * GET /api/voice/session/:sessionId
 * Get session information
 */
router.get('/session/:sessionId', verifyWallet, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const sessionInfo = voiceService.getSessionInfo(sessionId);

        if (!sessionInfo) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const isValid = voiceService.isSessionValid(sessionId);

        res.json({
            ...sessionInfo,
            isValid,
            maxDuration: MAX_SESSION_DURATION_MS / 1000,
            remainingTime: isValid ? (MAX_SESSION_DURATION_MS - sessionInfo.duration) / 1000 : 0,
        });
    } catch (error: any) {
        console.error('Get session error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

/**
 * DELETE /api/voice/session/:sessionId
 * Close a voice session
 */
router.delete('/session/:sessionId', verifyWallet, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        await voiceService.closeSession(sessionId);

        res.json({
            message: 'Session closed',
            sessionId,
        });
    } catch (error: any) {
        console.error('Close session error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

/**
 * GET /api/voice/cost
 * Get estimated cost for a voice session
 */
router.get('/cost', costCalculationRateLimiter, async (req: Request, res: Response) => {
    try {
        const requiredTokens = priceOracle.calculateTokenBurn(ESTIMATED_VOICE_SESSION_COST_USD);
        const tokenPrice = priceOracle.getTWAPPrice();

        res.json({
            costUsd: ESTIMATED_VOICE_SESSION_COST_USD,
            costTokens: requiredTokens,
            tokenPrice,
            serviceAvailable: voiceService.isAvailable(),
            maxSessionDuration: MAX_SESSION_DURATION_MS / 1000, // seconds
            note: 'All voice interactions use Grok Voice Agent WebSocket API',
        });
    } catch (error: any) {
        console.error('Error calculating cost:', error);
        res.status(500).json({ error: 'Failed to calculate cost' });
    }
});

export default router;

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