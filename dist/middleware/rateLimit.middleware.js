"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.settlementRateLimiter = exports.voiceRateLimiter = exports.chatRateLimiter = exports.costCalculationRateLimiter = exports.generalRateLimiter = void 0;
exports.getConfiguredRateLimiter = getConfiguredRateLimiter;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/**
 * Rate Limiting Middleware
 * Prevents abuse of API endpoints
 */
// General API rate limiter (100 requests per 15 minutes per IP)
exports.generalRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil(15 * 60), // seconds
        });
    },
});
// Strict rate limiter for cost calculation endpoints (20 requests per minute)
exports.costCalculationRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: 'Too many cost calculation requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
// Chat endpoint rate limiter (30 requests per minute per wallet)
exports.chatRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many chat requests, please try again later.',
    keyGenerator: (req) => {
        var _a;
        // Rate limit by wallet address if available, otherwise by IP
        return ((_a = req.body) === null || _a === void 0 ? void 0 : _a.walletAddress) || req.headers['x-wallet-address'] || req.ip || 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Voice endpoint rate limiter (10 requests per minute per wallet - more expensive)
exports.voiceRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: 'Too many voice requests, please try again later.',
    keyGenerator: (req) => {
        var _a;
        return ((_a = req.body) === null || _a === void 0 ? void 0 : _a.walletAddress) || req.headers['x-wallet-address'] || req.ip || 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
});
// Settlement trigger rate limiter (5 requests per hour - admin only)
exports.settlementRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: 'Too many settlement triggers, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
// Configure rate limits from environment variables
function getConfiguredRateLimiter(windowMinutes, maxRequests, keyGenerator) {
    return (0, express_rate_limit_1.default)({
        windowMs: windowMinutes * 60 * 1000,
        max: maxRequests,
        keyGenerator: keyGenerator || ((req) => req.ip || 'unknown'),
        standardHeaders: true,
        legacyHeaders: false,
    });
}
