"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateUsageCost = exports.COSTS = void 0;
exports.COSTS = {
    WHISPER_PER_MINUTE: 0.006, // Example cost
    LLM_INPUT_TOKEN: 0.000001, // Example
    LLM_OUTPUT_TOKEN: 0.000002,
    ELEVENLABS_CHAR: 0.00003,
    MARKUP_MULTIPLIER: 1.5, // We charge 1.5x cost? Or internal tracking only?
    // "Internally: 1 chatbot token = X USD cost"
};
const calculateUsageCost = (sttMinutes, inputTokens, outputTokens, ttsChars) => {
    return (sttMinutes * exports.COSTS.WHISPER_PER_MINUTE +
        inputTokens * exports.COSTS.LLM_INPUT_TOKEN +
        outputTokens * exports.COSTS.LLM_OUTPUT_TOKEN +
        ttsChars * exports.COSTS.ELEVENLABS_CHAR);
};
exports.calculateUsageCost = calculateUsageCost;
