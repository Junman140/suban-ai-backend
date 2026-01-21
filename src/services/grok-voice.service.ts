import WebSocket from 'ws';
import { EventEmitter } from 'events';
import dotenv from 'dotenv';

// Load environment variables before anything else
dotenv.config();

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
    commitAudioBuffer(): void;
}

class GrokVoiceService {
    private apiKey: string | null = null;
    private baseUrl = 'wss://api.x.ai/v1/realtime';
    private maxSessionDuration = 180000; // 3 minutes in milliseconds
    private sessions: Map<string, GrokVoiceSessionImpl> = new Map();

    constructor() {
        // Ensure dotenv is loaded
        dotenv.config();
        
        this.apiKey = process.env.GROK_API_KEY || null;
        
        // Debug logging
        console.log('🔍 Checking GROK_API_KEY:', {
            exists: !!process.env.GROK_API_KEY,
            length: process.env.GROK_API_KEY?.length || 0,
            startsWith: process.env.GROK_API_KEY?.substring(0, 4) || 'N/A'
        });
        
        if (!this.apiKey) {
            console.warn('⚠️  GROK_API_KEY not found in environment variables. Voice service will be unavailable.');
            console.warn('💡 Make sure .env file is in the BACKEND directory and contains: GROK_API_KEY=xai-...');
        } else {
            console.log('✅ Grok Voice Agent API key loaded');
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
            console.error('❌ Grok API key not configured');
            throw new Error('Grok API key not configured');
        }

        const sessionId = `grok-voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log('🔨 Creating Grok Voice session:', sessionId);
        console.log('🔗 Connecting to:', this.baseUrl);
        
        const session = new GrokVoiceSessionImpl(
            sessionId,
            this.baseUrl,
            this.apiKey,
            config,
            this.maxSessionDuration
        );

        this.sessions.set(sessionId, session);
        console.log('📝 Session stored in map, total sessions:', this.sessions.size);

        // Clean up on session end
        session.on('close', () => {
            console.log('🗑️ Removing session from map:', sessionId);
            this.sessions.delete(sessionId);
        });

        // Auto-close after max duration
        setTimeout(() => {
            if (session.isConnected) {
                console.log('⏰ Auto-closing session after max duration:', sessionId);
                session.close().catch(console.error);
            }
        }, this.maxSessionDuration);

        try {
            console.log('🔌 Connecting to Grok Voice API...');
            await session.connect();
            console.log('✅ Successfully connected to Grok Voice API');
        } catch (error: any) {
            console.error('❌ Failed to connect to Grok Voice API:', error.message);
            this.sessions.delete(sessionId);
            throw error;
        }

        return session;
    }

    /**
     * Get active session by ID
     */
    getSession(sessionId: string): GrokVoiceSession | undefined {
        const session = this.sessions.get(sessionId);
        console.log('🔍 Looking up session:', sessionId, 'Found:', !!session, 'Total sessions:', this.sessions.size);
        if (!session) {
            console.log('📋 Available sessions:', Array.from(this.sessions.keys()));
        }
        return session;
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
                // Connect to Grok Voice Agent API (model is specified in session config, not URL)
                const url = this.baseUrl;
                console.log('🔗 Connecting to Grok Voice API:', url);
                this.ws = new WebSocket(url, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                    },
                });

                this.ws.on('open', () => {
                    console.log('✅ Grok Voice API WebSocket opened');
                    this.isConnected = true;
                    this.startTime = Date.now();
                    this.emit('connected');
                    // Send configuration immediately after connection
                    this.sendConfig();
                    resolve();
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        console.log('📥 Received from Grok Voice API:', message.type);
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('❌ Failed to parse Grok message:', error);
                        this.emit('error', new Error(`Failed to parse message: ${error}`));
                    }
                });

                this.ws.on('error', (error: Error) => {
                    console.error('❌ Grok Voice API WebSocket error:', error.message);
                    this.emit('error', error);
                    if (!this.isConnected) {
                        reject(error);
                    }
                });

                this.ws.on('close', (code: number, reason: Buffer) => {
                    const reasonStr = reason.toString();
                    console.log('🔌 Grok Voice API WebSocket closed:', { code, reason: reasonStr });
                    this.isConnected = false;
                    this.duration = Date.now() - this.startTime;
                    this.emit('close');
                    // Don't auto-reconnect if it was a clean close or intentional
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

        // Configure session according to Grok Voice Agent API specification
        const defaultInstructions = `You are Suban, an AI voice assistant created for gamers and AI enthusiasts. 
You are helpful, friendly, and conversational. Your purpose is to assist users with their questions and tasks.
When users speak, wait for them to finish their complete thought before responding - be patient and don't interrupt.
Always identify yourself as Suban, not Grok or any other AI.`;

        const configMessage = {
            type: 'session.update',
            session: {
                voice: this.config.voice || 'Ara',
                instructions: this.config.systemInstructions || defaultInstructions,
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

        console.log('📤 Sending session configuration to Grok Voice API');
        this.ws.send(JSON.stringify(configMessage));
    }

    private handleMessage(message: any): void {
        switch (message.type) {
            case 'session.updated':
                console.log('✅ Grok session configuration confirmed');
                break;

            case 'conversation.created':
                console.log('💬 Grok conversation created:', message.conversation?.id);
                break;

            case 'input_audio_buffer.speech_started':
                // Server VAD detected speech start
                console.log('🎤 Grok detected speech started');
                this.emit('speech_started');
                break;

            case 'input_audio_buffer.speech_stopped':
                // Server VAD detected speech end
                console.log('🔇 Grok detected speech stopped');
                this.emit('speech_stopped');
                break;

            case 'input_audio_buffer.committed':
                // Audio buffer committed (with server_vad, this happens automatically)
                console.log('✅ Grok audio buffer committed');
                // After commit, Grok should automatically create a response
                break;

            case 'conversation.item.added':
                // New item added to conversation (user message or assistant response)
                console.log('📝 Grok conversation item added');
                if (message.item?.role === 'assistant') {
                    // Assistant response added
                    this.emit('response_created');
                }
                break;

            case 'response.output_item.added':
                // Response output item added
                console.log('📤 Grok response output item added');
                this.emit('response_created');
                break;

            case 'response.created':
                // Response generation started
                console.log('💬 Grok response created');
                this.emit('response_created');
                break;

            case 'response.output_audio.delta':
                // Audio chunk received (correct event name per API docs)
                if (message.delta) {
                    this.emit('audio', Buffer.from(message.delta, 'base64'));
                }
                break;

            case 'conversation.item.input_audio_transcription.completed':
                // User's audio transcription completed
                if (message.transcript) {
                    console.log('📝 User transcript:', message.transcript);
                    this.emit('user_transcript', message.transcript);
                }
                break;

            case 'response.output_audio_transcript.delta':
                // Assistant transcript delta (correct event name per API docs)
                if (message.delta) {
                    this.emit('transcript', message.delta);
                }
                break;

            case 'response.output_audio_transcript.done':
                // Transcript complete
                console.log('📝 Grok transcript completed');
                this.emit('transcript_done');
                break;

            case 'response.output_audio.done':
                // Audio complete
                console.log('🔊 Grok audio completed');
                break;

            case 'response.done':
                // Response complete
                console.log('✅ Grok response completed');
                this.emit('response_done');
                break;

            case 'error':
                const errorMsg = message.error?.message || message.error || JSON.stringify(message);
                console.error('❌ Grok API error:', errorMsg);
                console.error('❌ Full error message:', JSON.stringify(message, null, 2));
                this.emit('error', new Error(errorMsg));
                break;

            default:
                // Log unhandled message types for debugging
                console.log('📨 Unhandled Grok message type:', message.type);
                // Emit other message types
                this.emit('message', message);
        }
    }

    sendAudio(audioBuffer: Buffer): void {
        if (!this.ws || !this.isConnected) {
            throw new Error('Session not connected');
        }

        // Convert audio buffer to base64 PCM16 format
        // The audio should already be in PCM16 format from the frontend
        const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: audioBuffer.toString('base64'),
        };

        // Debug: log first few audio sends
        if (!(this as any)._audioSendCount) {
            (this as any)._audioSendCount = 0;
        }
        if ((this as any)._audioSendCount < 3) {
            console.log('📤 Sending audio to Grok API', {
                sessionId: this.sessionId,
                audioSize: audioBuffer.length,
                base64Length: audioMessage.audio.length,
                count: (this as any)._audioSendCount + 1
            });
            (this as any)._audioSendCount++;
        }

        this.ws.send(JSON.stringify(audioMessage));
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

        console.log('📤 Sending text to Grok:', text);
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

        console.log('📤 Committing audio buffer to Grok');
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
