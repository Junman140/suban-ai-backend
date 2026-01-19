import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * Grok Voice Agent Service
 * Handles real-time voice interactions via Grok Voice Agent API WebSocket
 */

export interface GrokVoiceConfig {
    model?: string;
    voice?: 'Ara' | 'Rex' | 'Sal' | 'Eve' | 'Leo';
    temperature?: number;
    systemInstructions?: string;
}

export interface GrokVoiceSession extends EventEmitter {
    sessionId: string;
    isConnected: boolean;
    startTime: number;
    duration: number;
    close(): Promise<void>;
    sendAudio(audioBuffer: Buffer): void;
    sendText(text: string): void;
}

class GrokVoiceService {
    private apiKey: string | null = null;
    private baseUrl = 'wss://api.x.ai/v1/realtime';
    private maxSessionDuration = 180000; // 3 minutes in milliseconds
    private sessions: Map<string, GrokVoiceSessionImpl> = new Map();

    constructor() {
        this.apiKey = process.env.GROK_API_KEY || null;
    }

    /**
     * Check if Grok Voice Agent is configured
     */
    isAvailable(): boolean {
        return this.apiKey !== null;
    }

    /**
     * Create a new voice session
     * @param config Voice configuration
     * @returns Voice session instance
     */
    async createSession(config: GrokVoiceConfig = {}): Promise<GrokVoiceSession> {
        if (!this.apiKey) {
            throw new Error('Grok API key not configured');
        }

        const sessionId = `grok-voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const session = new GrokVoiceSessionImpl(
            sessionId,
            this.baseUrl,
            this.apiKey,
            config,
            this.maxSessionDuration
        );

        this.sessions.set(sessionId, session);

        // Clean up on session end
        session.on('close', () => {
            this.sessions.delete(sessionId);
        });

        // Auto-close after max duration
        setTimeout(() => {
            if (session.isConnected) {
                session.close().catch(console.error);
            }
        }, this.maxSessionDuration);

        await session.connect();

        return session;
    }

    /**
     * Get active session by ID
     */
    getSession(sessionId: string): GrokVoiceSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Close all active sessions
     */
    async closeAllSessions(): Promise<void> {
        const closePromises = Array.from(this.sessions.values()).map(session =>
            session.close().catch(console.error)
        );
        await Promise.all(closePromises);
        this.sessions.clear();
    }
}

class GrokVoiceSessionImpl extends EventEmitter implements GrokVoiceSession {
    public sessionId: string;
    public isConnected: boolean = false;
    public startTime: number = 0;
    public duration: number = 0;

    private ws: WebSocket | null = null;
    private baseUrl: string;
    private apiKey: string;
    private config: GrokVoiceConfig;
    private maxDuration: number;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 3;

    constructor(
        sessionId: string,
        baseUrl: string,
        apiKey: string,
        config: GrokVoiceConfig,
        maxDuration: number
    ) {
        super();
        this.sessionId = sessionId;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.config = config;
        this.maxDuration = maxDuration;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const url = `${this.baseUrl}?model=${this.config.model || 'grok-4-1-fast-non-reasoning'}`;
                this.ws = new WebSocket(url, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                    },
                });

                this.ws.on('open', () => {
                    this.isConnected = true;
                    this.startTime = Date.now();
                    this.emit('connected');
                    this.sendConfig();
                    resolve();
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleMessage(message);
                    } catch (error) {
                        this.emit('error', new Error(`Failed to parse message: ${error}`));
                    }
                });

                this.ws.on('error', (error) => {
                    this.emit('error', error);
                    if (!this.isConnected) {
                        reject(error);
                    }
                });

                this.ws.on('close', () => {
                    this.isConnected = false;
                    this.duration = Date.now() - this.startTime;
                    this.emit('close');
                    this.handleReconnect();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    private sendConfig(): void {
        if (!this.ws || !this.isConnected) return;

        const configMessage = {
            type: 'session.update',
            session: {
                modalities: ['text', 'audio'],
                instructions: this.config.systemInstructions || '',
                voice: this.config.voice || 'Ara',
                temperature: this.config.temperature || 0.7,
            },
        };

        this.ws.send(JSON.stringify(configMessage));
    }

    private handleMessage(message: any): void {
        switch (message.type) {
            case 'response.audio.delta':
                // Audio chunk received
                if (message.delta) {
                    this.emit('audio', Buffer.from(message.delta, 'base64'));
                }
                break;

            case 'response.audio_transcript.delta':
                // Transcript delta
                if (message.delta) {
                    this.emit('transcript', message.delta);
                }
                break;

            case 'response.done':
                // Response complete
                this.emit('response_done');
                break;

            case 'error':
                this.emit('error', new Error(message.error?.message || 'Unknown error'));
                break;

            default:
                // Emit other message types
                this.emit('message', message);
        }
    }

    sendAudio(audioBuffer: Buffer): void {
        if (!this.ws || !this.isConnected) {
            throw new Error('Session not connected');
        }

        const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: audioBuffer.toString('base64'),
        };

        this.ws.send(JSON.stringify(audioMessage));
    }

    sendText(text: string): void {
        if (!this.ws || !this.isConnected) {
            throw new Error('Session not connected');
        }

        const textMessage = {
            type: 'input_audio_buffer.commit',
        };

        // First commit any pending audio
        this.ws.send(JSON.stringify(textMessage));

        // Then send text
        const message = {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text,
                    },
                ],
            },
        };

        this.ws.send(JSON.stringify(message));
    }

    async close(): Promise<void> {
        if (this.ws) {
            return new Promise((resolve) => {
                if (this.ws!.readyState === WebSocket.OPEN) {
                    this.ws!.close();
                }
                this.ws = null;
                this.isConnected = false;
                this.duration = Date.now() - this.startTime;
                resolve();
            });
        }
    }

    private handleReconnect(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                this.connect().catch((error) => {
                    this.emit('error', error);
                });
            }, 1000 * this.reconnectAttempts);
        }
    }
}

export const grokVoiceService = new GrokVoiceService();
export default grokVoiceService;
