import { Router, Request, Response } from 'express';
import { verifyWallet } from '../middleware/auth.middleware';
import { voiceRateLimiter } from '../middleware/rateLimit.middleware';
import grokVoiceService from '../services/grok-voice.service';
import balanceTracker from '../services/solana/balance-tracker.service';
import priceOracle from '../services/solana/price-oracle.service';
import tokenMeterService from '../services/tokenMeter.service';

const router = Router();

/**
 * POST /api/voice/realtime/session
 * Create a new Grok Voice Agent session
 */
router.post('/session', voiceRateLimiter, verifyWallet, async (req: Request, res: Response) => {
    try {
        const { walletAddress, userId, voice, model, systemInstructions } = req.body;
        const userWallet = walletAddress || req.walletAddress!;
        const userIdentifier = userId || userWallet;

        if (!grokVoiceService.isAvailable()) {
            return res.status(503).json({ error: 'Grok Voice Agent service not configured' });
        }

        // Estimate cost for voice session (rough estimate)
        const estimatedCost = 0.10; // $0.10 per session estimate
        const requiredTokens = priceOracle.calculateTokenBurn(estimatedCost);

        // Check balance
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
                costUsd: estimatedCost,
            });
        }

        // Create voice session
        const session = await grokVoiceService.createSession({
            model: model || 'grok-4-1-fast-non-reasoning',
            voice: voice || 'Ara',
            systemInstructions: systemInstructions || '',
        });

        res.json({
            sessionId: session.sessionId,
            message: 'Voice session created. Connect via WebSocket to /api/voice/realtime/ws/:sessionId',
            wsUrl: `/api/voice/realtime/ws/${session.sessionId}`,
        });
    } catch (error: any) {
        console.error('Voice session creation error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

/**
 * GET /api/voice/realtime/session/:sessionId
 * Get session information
 */
router.get('/session/:sessionId', verifyWallet, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const session = grokVoiceService.getSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json({
            sessionId: session.sessionId,
            isConnected: session.isConnected,
            duration: session.duration,
            startTime: session.startTime,
        });
    } catch (error: any) {
        console.error('Get session error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

/**
 * DELETE /api/voice/realtime/session/:sessionId
 * Close a voice session
 */
router.delete('/session/:sessionId', verifyWallet, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const session = grokVoiceService.getSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        await session.close();

        res.json({
            message: 'Session closed',
            sessionId,
            duration: session.duration,
        });
    } catch (error: any) {
        console.error('Close session error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

export default router;

// Note: WebSocket endpoint would be handled separately in the main server file
// This would typically be set up with express-ws or similar:
// 
// import expressWs from 'express-ws';
// const { app } = expressWs(express());
// 
// app.ws('/api/voice/realtime/ws/:sessionId', async (ws, req) => {
//     const { sessionId } = req.params;
//     const session = grokVoiceService.getSession(sessionId);
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
