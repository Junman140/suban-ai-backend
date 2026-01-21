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
exports.grokVoiceService = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
class GrokVoiceService {
    constructor() {
        this.apiKey = null;
        this.baseUrl = 'wss://api.x.ai/v1/realtime';
        this.maxSessionDuration = 180000; // 3 minutes in milliseconds
        this.sessions = new Map();
        this.apiKey = process.env.GROK_API_KEY || null;
        if (!this.apiKey) {
            console.warn('⚠️  GROK_API_KEY not found in environment variables. Voice service will be unavailable.');
        }
        else {
            console.log('✅ Grok Voice Agent API key loaded');
        }
    }
    /**
     * Check if Grok Voice Agent is configured
     */
    isAvailable() {
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
    createSession() {
        return __awaiter(this, arguments, void 0, function* (config = {}) {
            if (!this.apiKey) {
                throw new Error('Grok API key not configured');
            }
            const sessionId = `grok-voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const session = new GrokVoiceSessionImpl(sessionId, this.baseUrl, this.apiKey, config, this.maxSessionDuration);
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
            yield session.connect();
            return session;
        });
    }
    /**
     * Get active session by ID
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Close all active sessions
     */
    closeAllSessions() {
        return __awaiter(this, void 0, void 0, function* () {
            const closePromises = Array.from(this.sessions.values()).map(session => session.close().catch(console.error));
            yield Promise.all(closePromises);
            this.sessions.clear();
        });
    }
}
class GrokVoiceSessionImpl extends events_1.EventEmitter {
    constructor(sessionId, baseUrl, apiKey, config, maxDuration) {
        super();
        this.isConnected = false;
        this.startTime = 0;
        this.duration = 0;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.sessionId = sessionId;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.config = config;
        this.maxDuration = maxDuration;
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                try {
                    const url = `${this.baseUrl}?model=${this.config.model || 'grok-4-1-fast-non-reasoning'}`;
                    this.ws = new ws_1.default(url, {
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
                    this.ws.on('message', (data) => {
                        try {
                            const message = JSON.parse(data.toString());
                            this.handleMessage(message);
                        }
                        catch (error) {
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
                }
                catch (error) {
                    reject(error);
                }
            });
        });
    }
    sendConfig() {
        if (!this.ws || !this.isConnected)
            return;
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
    handleMessage(message) {
        var _a;
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
                this.emit('error', new Error(((_a = message.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error'));
                break;
            default:
                // Emit other message types
                this.emit('message', message);
        }
    }
    sendAudio(audioBuffer) {
        if (!this.ws || !this.isConnected) {
            throw new Error('Session not connected');
        }
        const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: audioBuffer.toString('base64'),
        };
        this.ws.send(JSON.stringify(audioMessage));
    }
    sendText(text) {
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
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.ws) {
                return new Promise((resolve) => {
                    if (this.ws.readyState === ws_1.default.OPEN) {
                        this.ws.close();
                    }
                    this.ws = null;
                    this.isConnected = false;
                    this.duration = Date.now() - this.startTime;
                    resolve();
                });
            }
        });
    }
    handleReconnect() {
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
exports.grokVoiceService = new GrokVoiceService();
exports.default = exports.grokVoiceService;
