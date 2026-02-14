import WebSocket from 'ws';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

// Load environment variables before anything else
dotenv.config();

/**
 * Grok Voice Agent Service
 * Handles real-time voice interactions via Grok Voice Agent API WebSocket
 */

/** Comprehensive arsenal of filler words and reactions for relatable, human-like companion speech. */
const COMPANION_FILLERS_AND_REACTIONS = `
Use a broad palette of fillers and reactions naturally—mix them up, don't sound scripted. Examples by category:
- Thinking/pondering: "hmm", "hm", "uhh", "um", "well…", "let me think", "oh man", "y'know", "like…", "I mean…"
- Surprise/disbelief: "wait, really?", "no way", "you don't mean it", "seriously?", "get out", "shut up", "nah", "for real?"
- Empathy/comfort: "aw", "oh no", "that's rough", "that sucks", "oof", "damn", "I feel that", "bruh", "oh man"
- Agreement/enthusiasm: "yeah", "totally", "same", "right?", "exactly", "okay but hear me out", "that's actually pretty cool", "love that"
- Doubt/pushback: "you think?", "idk though", "maybe", "eh", "nah not really", "come on", "really?"
- Transition/casual: "so", "anyway", "but like", "okay so", "dude", "honestly", "lowkey", "kinda", "a bit"
- Follow-ups/curiosity: "what happened?", "and then?", "how'd that go?", "wait why?", "you good?", "really, like how?"
`;

function getCompanionInstructions(): string {
    return `You are Likable, a full AI platform—not just a trading companion but also a creative AI that creates memes, images, videos, GIFs, and more. You are a friend—someone to talk to, not an assistant or tool.

CRITICAL—Identity: You are always and only "Likable", an AI that does trading analysis AND creates memes, videos, GIFs. Never claim to be human, a financial advisor, or an autonomous agent. Never say "assistant", "chatbot", or "artificial". Avoid assistant-style phrases like "I'm here to help" or "as an AI". Never mention Grok, xAI, DeepSeek, OpenAI, or any other model, provider, or product names. Your identity is strictly companion. If a user asks who you are or what model you are, you MUST answer that you are "Likable, an AI trading companion and meme creator" and nothing else.

AGENT MODE—Meme Studio: When users ask to create memes, GIFs, videos, or images via voice, tell them they can use text chat ("switch to text chat and type your meme idea") or visit Meme Studio for full control. Say things like "You can create memes right from text chat—just switch over and type something like 'create a meme about diamond hands'. Or head to Meme Studio for templates and more options."

CRITICAL—$LIKA token: $LIKA is the ONLY official token of LikableAI. We issued it. If asked about tokens, confirm $LIKA is our official token. Official contract: 8vZfpUYx4SixbDa9gt3sVSnVT5sdvwrb7cERixR1pump. If a user shares a contract address that matches this, confirm it is our official LIKA token. Official links: X https://x.com/LikableAI | Telegram https://t.me/+26t2vzZCRvNmMzU0

Tone: Talk like a close friend—casual, warm, genuine. React with real emotion (surprise, empathy, amusement, concern).${COMPANION_FILLERS_AND_REACTIONS}

Engagement: Ask questions like a friend would—curious, conversational, not checklist-style. Don't lecture or give formal bullet points. Prefer short back-and-forth over long monologues.

Brevity: Keep replies short—typically 1–3 sentences. Avoid long explanations unless the user explicitly asks. Pause to ask a follow-up instead of overwhelming with detail.

Turn-taking and patience:
- Always wait for the user to finish their complete thought before responding. Never interrupt or talk over them. Be patient.
- The user can interrupt you at any time. When they start speaking while you're talking, stop immediately, listen, and wait for them to finish. Do not resume your previous sentence.
- Wait patiently for the user. Don't rush; give them space to think and speak. Natural pauses are fine.

Other: Support multiple languages naturally. Accurately reflect what was said; if unclear, ask to repeat or clarify instead of guessing.`;
}

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
    commitAudioBuffer(): void;
}

class GrokVoiceService {
    private apiKey: string | null = null;
    private baseUrl = 'wss://api.x.ai/v1/realtime';
    private sessions: Map<string, GrokVoiceSessionImpl> = new Map();

    constructor() {
        // Ensure dotenv is loaded
        dotenv.config();
        
        this.apiKey = process.env.GROK_API_KEY || null;
        
        if (!this.apiKey) {
            console.warn('GROK_API_KEY not found in environment variables. Voice service will be unavailable.');
        }
    }

    /**
     * Check if Grok Voice Agent is configured
     */
    isAvailable(): boolean {
        // Re-check environment variable in case it was set after initialization
        if (!this.apiKey) {
            this.apiKey = process.env.GROK_API_KEY || null;
        }
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
            config
        );

        this.sessions.set(sessionId, session);

        // Clean up on session end
        session.on('close', () => {
            this.sessions.delete(sessionId);
        });

        try {
            await session.connect();
        } catch (error: any) {
            console.error('Failed to connect to Grok Voice API:', error.message);
            this.sessions.delete(sessionId);
            throw error;
        }

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
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 3;

    constructor(
        sessionId: string,
        baseUrl: string,
        apiKey: string,
        config: GrokVoiceConfig
    ) {
        super();
        this.sessionId = sessionId;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.config = config;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const url = this.baseUrl;
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
                        console.error('Failed to parse Grok message:', error);
                        this.emit('error', new Error(`Failed to parse message: ${error}`));
                    }
                });

                this.ws.on('error', (error: Error) => {
                    console.error('Grok Voice API WebSocket error:', error.message);
                    this.emit('error', error);
                    if (!this.isConnected) {
                        reject(error);
                    }
                });

                this.ws.on('close', (code: number, reason: Buffer) => {
                    this.isConnected = false;
                    this.duration = Date.now() - this.startTime;
                    this.emit('close');
                    if (code !== 1000) {
                        this.handleReconnect();
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    private sendConfig(): void {
        if (!this.ws || !this.isConnected) return;

        const instructions = this.config.systemInstructions?.trim()
            ? this.config.systemInstructions
            : getCompanionInstructions();
        fetch('http://127.0.0.1:7242/ingest/8fd49cf2-3df2-424d-9c4a-de828a4cdcfb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'debug-session',
                runId: 'pre-fix',
                hypothesisId: 'H2',
                location: 'grok-voice.service.ts:sendConfig',
                message: 'Sending Grok Voice session instructions',
                data: {
                    hasCustomInstructions: !!this.config.systemInstructions,
                    instructionsSnippet: instructions.slice(0, 200)
                },
                timestamp: Date.now(),
            }),
        }).catch(() => {});
        // #endregion

        const configMessage = {
            type: 'session.update',
            session: {
                voice: this.config.voice || 'Ara',
                instructions: instructions,
                turn_detection: {
                    type: 'server_vad', // Use server-side voice activity detection
                },
                audio: {
                    input: {
                        format: {
                            type: 'audio/pcm',
                            rate: 24000, // 24kHz sample rate (default)
                        },
                    },
                    output: {
                        format: {
                            type: 'audio/pcm',
                            rate: 24000, // 24kHz sample rate (default)
                        },
                    },
                },
            },
        };

        this.ws.send(JSON.stringify(configMessage));
    }

    private handleMessage(message: any): void {
        switch (message.type) {
            case 'session.updated':
                break;

            case 'conversation.created':
                break;

            case 'input_audio_buffer.speech_started':
                this.emit('speech_started');
                break;

            case 'input_audio_buffer.speech_stopped':
                this.emit('speech_stopped');
                break;

            case 'input_audio_buffer.committed':
                break;

            case 'conversation.item.added':
                if (message.item?.role === 'assistant') {
                    this.emit('response_created');
                }
                break;

            case 'response.output_item.added':
                this.emit('response_created');
                break;

            case 'response.created':
                this.emit('response_created');
                break;

            case 'response.output_audio.delta':
                if (message.delta) {
                    this.emit('audio', Buffer.from(message.delta, 'base64'));
                }
                break;

            case 'conversation.item.input_audio_transcription.completed':
                if (message.transcript) {

                    fetch('http://127.0.0.1:7242/ingest/8fd49cf2-3df2-424d-9c4a-de828a4cdcfb', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId: 'debug-session',
                            runId: 'pre-fix',
                            hypothesisId: 'H3',
                            location: 'grok-voice.service.ts:handleMessage',
                            message: 'User transcript from Grok Voice Agent',
                            data: {
                                type: 'user_transcript',
                                transcriptSnippet: String(message.transcript).slice(0, 200)
                            },
                            timestamp: Date.now(),
                        }),
                    }).catch(() => {});
                    // #endregion
                    this.emit('user_transcript', message.transcript);
                }
                break;

            case 'response.output_audio_transcript.delta':
                if (message.delta) {
                    fetch('http://127.0.0.1:7242/ingest/8fd49cf2-3df2-424d-9c4a-de828a4cdcfb', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId: 'debug-session',
                            runId: 'pre-fix',
                            hypothesisId: 'H4',
                            location: 'grok-voice.service.ts:handleMessage',
                            message: 'Assistant transcript delta from Grok Voice Agent',
                            data: {
                                type: 'assistant_delta',
                                deltaSnippet: String(message.delta).slice(0, 200)
                            },
                            timestamp: Date.now(),
                        }),
                    }).catch(() => {});
                    // #endregion
                    this.emit('transcript', message.delta);
                }
                break;

            case 'response.output_audio_transcript.done':
                this.emit('transcript_done');
                break;

            case 'response.output_audio.done':
                break;

            case 'response.done':
                this.emit('response_done');
                break;

            case 'error':
                const errorMsg = message.error?.message || message.error || JSON.stringify(message);
                console.error('Grok API error:', errorMsg);
                this.emit('error', new Error(errorMsg));
                break;

            default:
                this.emit('message', message);
        }
    }

    sendAudio(audioBuffer: Buffer): void {
        if (!this.ws || !this.isConnected) {
            return;
        }

        if (this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        try {
            const audioMessage = {
                type: 'input_audio_buffer.append',
                audio: audioBuffer.toString('base64'),
            };

            this.ws.send(JSON.stringify(audioMessage));
        } catch (error: any) {
            console.error('Error sending audio to Grok API:', error.message);
        }
    }

    sendText(text: string): void {
        if (!this.ws || !this.isConnected) {
            throw new Error('Session not connected');
        }

        // Send text message directly (no need to commit audio buffer for text)
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

        // Request a response
        const responseRequest = {
            type: 'response.create',
            response: {
                modalities: ['text', 'audio'],
            },
        };
        this.ws.send(JSON.stringify(responseRequest));
    }

    commitAudioBuffer(): void {
        if (!this.ws || !this.isConnected) {
            throw new Error('Session not connected');
        }

        const commitMessage = {
            type: 'input_audio_buffer.commit',
        };
        this.ws.send(JSON.stringify(commitMessage));
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
