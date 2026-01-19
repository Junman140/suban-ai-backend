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
exports.voiceService = void 0;
const openai_1 = __importDefault(require("openai"));
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class VoiceService {
    constructor() {
        this.openai = null;
        this.elevenLabsApiKey = null;
        const openaiKey = process.env.OPENAI_API_KEY;
        if (openaiKey) {
            this.openai = new openai_1.default({ apiKey: openaiKey });
        }
        this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || null;
        this.elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Default voice: Rachel
    }
    /**
     * Convert speech to text using Whisper AI (OpenAI)
     */
    speechToText(audioBuffer, fileName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.openai) {
                throw new Error('OpenAI API key not configured. Whisper AI requires OpenAI API key.');
            }
            try {
                // Create a temporary file for the audio
                const tempDir = path_1.default.join(process.cwd(), 'temp');
                if (!fs_1.default.existsSync(tempDir)) {
                    fs_1.default.mkdirSync(tempDir, { recursive: true });
                }
                const tempFilePath = path_1.default.join(tempDir, fileName || `audio_${Date.now()}.mp3`);
                fs_1.default.writeFileSync(tempFilePath, audioBuffer);
                try {
                    // Create a file stream for OpenAI
                    const fileStream = fs_1.default.createReadStream(tempFilePath);
                    // Call Whisper API
                    const transcription = yield this.openai.audio.transcriptions.create({
                        file: fileStream,
                        model: 'whisper-1',
                        language: 'en', // Optional: can be auto-detected
                        response_format: 'verbose_json',
                    });
                    // Estimate duration (rough estimate based on file size)
                    // In production, you might want to use a library to get actual duration
                    const duration = transcription.duration || 0;
                    // Clean up temp file
                    fs_1.default.unlinkSync(tempFilePath);
                    return {
                        text: transcription.text,
                        duration,
                        language: transcription.language || 'en',
                    };
                }
                catch (error) {
                    // Clean up temp file on error
                    if (fs_1.default.existsSync(tempFilePath)) {
                        fs_1.default.unlinkSync(tempFilePath);
                    }
                    throw error;
                }
            }
            catch (error) {
                throw new Error(`Speech-to-text failed: ${error.message}`);
            }
        });
    }
    /**
     * Convert text to speech using ElevenLabs
     */
    textToSpeech(text, voiceId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.elevenLabsApiKey) {
                throw new Error('ElevenLabs API key not configured');
            }
            const targetVoiceId = voiceId || this.elevenLabsVoiceId;
            const characters = text.length;
            try {
                const response = yield axios_1.default.post(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
                    text,
                    model_id: 'eleven_monolingual_v1', // or 'eleven_multilingual_v1'
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                }, {
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': this.elevenLabsApiKey,
                    },
                    responseType: 'arraybuffer',
                    timeout: 30000,
                });
                const audioBuffer = Buffer.from(response.data);
                // Estimate duration (rough: ~150 words per minute, ~5 characters per word)
                // ElevenLabs typically generates speech at ~150-200 words/minute
                const estimatedDuration = (characters / 5) / 150 * 60; // seconds
                // In production, you might want to:
                // 1. Store the audio file in cloud storage (S3, etc.)
                // 2. Return a URL to the stored file
                // 3. Or return the buffer and let the route handle storage
                return {
                    audioUrl: '', // Will be set by route handler if storing
                    audioBuffer,
                    characters,
                    duration: estimatedDuration,
                };
            }
            catch (error) {
                throw new Error(`Text-to-speech failed: ${error.message}`);
            }
        });
    }
    /**
     * Process voice request: STT -> LLM -> TTS
     * This is a convenience method that chains the operations
     */
    processVoiceRequest(audioBuffer, llmCallback) {
        return __awaiter(this, void 0, void 0, function* () {
            // Step 1: Speech to Text
            const transcription = yield this.speechToText(audioBuffer);
            // Step 2: Get LLM response
            const llmResponse = yield llmCallback(transcription.text);
            // Step 3: Text to Speech
            const audio = yield this.textToSpeech(llmResponse);
            return {
                transcription,
                llmResponse,
                audio,
            };
        });
    }
    /**
     * Check if voice services are available
     */
    isAvailable() {
        return {
            stt: this.openai !== null,
            tts: this.elevenLabsApiKey !== null,
        };
    }
}
exports.voiceService = new VoiceService();
exports.default = exports.voiceService;
