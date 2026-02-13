import grokVoiceService from './grok-voice.service';
import balanceTracker from './solana/balance-tracker.service';
import priceOracle from './solana/price-oracle.service';

const ESTIMATED_VOICE_COST_PER_MINUTE_USD = 0.033; // ~$0.10 per 3 min

/**
 * Voice Service
 * Simplified voice service using only Grok Voice Agent WebSocket API
 * All voice interactions (STT, LLM, TTS) are handled by Grok Voice Agent
 */

export interface VoiceSessionInfo {
    sessionId: string;
    isConnected: boolean;
    duration: number;
    startTime: number;
}

class VoiceService {
    private sessionWalletMap: Map<string, string> = new Map();

    constructor() {
        // Service is initialized via constructor
    }

    /**
     * Create a new Grok Voice Agent session
     * This is the primary method for voice interactions
     */
    async createSession(config: {
        model?: string;
        voice?: 'Ara' | 'Rex' | 'Sal' | 'Eve' | 'Leo';
        systemInstructions?: string;
        temperature?: number;
        walletAddress?: string;
    } = {}) {
        if (!grokVoiceService.isAvailable()) {
            throw new Error('Grok Voice Agent service not configured. GROK_API_KEY required.');
        }

        const { walletAddress, ...grokConfig } = config;
        const session = await grokVoiceService.createSession(grokConfig);
        if (walletAddress) {
            this.sessionWalletMap.set(session.sessionId, walletAddress);
        }
        return session;
    }

    /**
     * Get active session by ID
     */
    getSession(sessionId: string) {
        return grokVoiceService.getSession(sessionId);
    }

    /**
     * Close a voice session and deduct tokens based on duration
     */
    async closeSession(sessionId: string): Promise<void> {
        const session = grokVoiceService.getSession(sessionId);
        const walletAddress = this.sessionWalletMap.get(sessionId);
        this.sessionWalletMap.delete(sessionId);

        if (session && walletAddress) {
            const durationMs = session.startTime ? Date.now() - session.startTime : 0;
            const durationMinutes = Math.max(0.5, durationMs / 60000);
            const usdCost = durationMinutes * ESTIMATED_VOICE_COST_PER_MINUTE_USD;
            try {
                const tokensToDeduct = priceOracle.calculateTokenBurn(usdCost);
                await balanceTracker.deductTokens(walletAddress, tokensToDeduct, 'voice', usdCost);
            } catch (e) {
                console.error('Voice session deduction failed:', (e as Error).message);
            }
        }

        if (session) {
            await session.close();
        }
    }

    /**
     * Get session information
     */
    getSessionInfo(sessionId: string): VoiceSessionInfo | null {
        const session = grokVoiceService.getSession(sessionId);
        if (!session) {
            return null;
        }

        return {
            sessionId: session.sessionId,
            isConnected: session.isConnected,
            duration: session.duration,
            startTime: session.startTime,
        };
    }

    /**
     * Check if voice service is available
     */
    isAvailable(): boolean {
        return grokVoiceService.isAvailable();
    }

    /**
     * Check session duration
     */
    isSessionValid(sessionId: string): boolean {
        const session = grokVoiceService.getSession(sessionId);
        if (!session) return false;
        // Sessions are valid as long as they're connected (no time limit)
        return session.isConnected;
    }
}

export const voiceService = new VoiceService();
export default voiceService;
