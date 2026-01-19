import grokVoiceService from './grok-voice.service';

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
    private readonly MAX_SESSION_DURATION = 180000; // 3 minutes in milliseconds

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
    } = {}) {
        if (!grokVoiceService.isAvailable()) {
            throw new Error('Grok Voice Agent service not configured. GROK_API_KEY required.');
        }

        return await grokVoiceService.createSession(config);
    }

    /**
     * Get active session by ID
     */
    getSession(sessionId: string) {
        return grokVoiceService.getSession(sessionId);
    }

    /**
     * Close a voice session
     */
    async closeSession(sessionId: string): Promise<void> {
        const session = grokVoiceService.getSession(sessionId);
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

        const duration = Date.now() - session.startTime;
        return duration < this.MAX_SESSION_DURATION;
    }
}

export const voiceService = new VoiceService();
export default voiceService;
