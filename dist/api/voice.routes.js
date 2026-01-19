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
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// Voice request cost in USD (default, will be calculated based on actual usage)
const DEFAULT_VOICE_COST_USD = parseFloat(process.env.DEFAULT_VOICE_COST_USD || '0.05');
/**
 * POST /api/voice/speak
 * Convert text to speech using ElevenLabs
 */
router.post('/speak', rateLimit_middleware_1.voiceRateLimiter, auth_middleware_1.verifyWallet, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { text, walletAddress, voiceId } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        if (!walletAddress && !req.walletAddress) {
            return res.status(400).json({ error: 'Wallet address is required' });
        }
        const userWallet = walletAddress || req.walletAddress;
        // Check if TTS is available
        if (!voice_service_1.default.isAvailable().tts) {
            return res.status(503).json({ error: 'Text-to-speech service not configured' });
        }
        // Calculate required tokens (using default cost for estimation)
        const requiredTokens = price_oracle_service_1.default.calculateTokenBurn(DEFAULT_VOICE_COST_USD);
        // Check balance
        const hasSufficientBalance = yield balance_tracker_service_1.default.hasSufficientBalance(userWallet, requiredTokens);
        if (!hasSufficientBalance) {
            const balance = yield balance_tracker_service_1.default.getBalance(userWallet);
            return res.status(402).json({
                error: 'Insufficient tokens',
                required: requiredTokens,
                available: balance.currentBalance,
                costUsd: DEFAULT_VOICE_COST_USD,
            });
        }
        // Process TTS request
        const ttsResult = yield voice_service_1.default.textToSpeech(text, voiceId);
        // Calculate actual cost based on character count
        // TODO: Use actual cost calculator in Phase 3
        const actualCostUsd = DEFAULT_VOICE_COST_USD;
        const actualRequiredTokens = price_oracle_service_1.default.calculateTokenBurn(actualCostUsd);
        // Deduct tokens after successful response
        const updatedBalance = yield balance_tracker_service_1.default.deductTokens(userWallet, actualRequiredTokens, 'voice', actualCostUsd);
        // Convert audio buffer to base64 for JSON response, or return as file
        // For production, you'd typically store the file and return a URL
        const audioBase64 = ((_a = ttsResult.audioBuffer) === null || _a === void 0 ? void 0 : _a.toString('base64')) || '';
        res.json({
            audioUrl: ttsResult.audioUrl,
            audioData: audioBase64, // Base64 encoded audio (for immediate playback)
            tokenInfo: {
                cost: actualRequiredTokens,
                costUsd: actualCostUsd,
                remainingBalance: updatedBalance.currentBalance,
                voiceUsage: {
                    characters: ttsResult.characters,
                    estimatedDuration: ttsResult.duration,
                },
            },
        });
    }
    catch (error) {
        console.error('Voice TTS error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
}));
/**
 * POST /api/voice/transcribe
 * Convert speech to text using Whisper AI
 */
router.post('/transcribe', rateLimit_middleware_1.voiceRateLimiter, auth_middleware_1.verifyWallet, upload.single('audio'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Audio file is required' });
        }
        const walletAddress = req.body.walletAddress || req.walletAddress;
        // Check if STT is available
        if (!voice_service_1.default.isAvailable().stt) {
            return res.status(503).json({ error: 'Speech-to-text service not configured' });
        }
        // Calculate required tokens (STT is typically cheaper)
        const sttCostUsd = parseFloat(process.env.STT_COST_USD || '0.01');
        const requiredTokens = price_oracle_service_1.default.calculateTokenBurn(sttCostUsd);
        // Check balance
        const hasSufficientBalance = yield balance_tracker_service_1.default.hasSufficientBalance(walletAddress, requiredTokens);
        if (!hasSufficientBalance) {
            const balance = yield balance_tracker_service_1.default.getBalance(walletAddress);
            return res.status(402).json({
                error: 'Insufficient tokens',
                required: requiredTokens,
                available: balance.currentBalance,
                costUsd: sttCostUsd,
            });
        }
        // Process STT request
        const sttResult = yield voice_service_1.default.speechToText(req.file.buffer, req.file.originalname);
        // Calculate actual cost based on duration
        // TODO: Use actual cost calculator in Phase 3
        const actualCostUsd = sttCostUsd; // Simplified for now
        const actualRequiredTokens = price_oracle_service_1.default.calculateTokenBurn(actualCostUsd);
        // Deduct tokens
        const updatedBalance = yield balance_tracker_service_1.default.deductTokens(walletAddress, actualRequiredTokens, 'voice', actualCostUsd);
        res.json({
            text: sttResult.text,
            language: sttResult.language,
            duration: sttResult.duration,
            tokenInfo: {
                cost: actualRequiredTokens,
                costUsd: actualCostUsd,
                remainingBalance: updatedBalance.currentBalance,
            },
        });
    }
    catch (error) {
        console.error('Voice STT error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
}));
/**
 * GET /api/voice/cost
 * Get estimated cost for a voice request
 */
router.get('/cost', rateLimit_middleware_1.costCalculationRateLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const requiredTokens = price_oracle_service_1.default.calculateTokenBurn(DEFAULT_VOICE_COST_USD);
        const tokenPrice = price_oracle_service_1.default.getTWAPPrice();
        res.json({
            costUsd: DEFAULT_VOICE_COST_USD,
            costTokens: requiredTokens,
            tokenPrice,
            serviceStatus: voice_service_1.default.isAvailable(),
        });
    }
    catch (error) {
        console.error('Error calculating cost:', error);
        res.status(500).json({ error: 'Failed to calculate cost' });
    }
}));
exports.default = router;
