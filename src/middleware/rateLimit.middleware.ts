import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate Limiting Middleware
 * Prevents abuse of API endpoints
 */

// General API rate limiter (100 requests per 15 minutes per IP)
export const generalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil(15 * 60), // seconds
        });
    },
});

// Strict rate limiter for cost calculation endpoints (20 requests per minute)
export const costCalculationRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: 'Too many cost calculation requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Chat endpoint rate limiter (30 requests per minute per wallet)
export const chatRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many chat requests, please try again later.',
    keyGenerator: (req: Request) => {
        // Rate limit by wallet address if available, otherwise by IP
        return req.body?.walletAddress || req.headers['x-wallet-address'] || req.ip || 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Voice endpoint rate limiter (10 requests per minute per wallet - more expensive)
export const voiceRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: 'Too many voice requests, please try again later.',
    keyGenerator: (req: Request) => {
        return req.body?.walletAddress || req.headers['x-wallet-address'] || req.ip || 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Settlement trigger rate limiter (5 requests per hour - admin only)
export const settlementRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: 'Too many settlement triggers, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Configure rate limits from environment variables
export function getConfiguredRateLimiter(
    windowMinutes: number,
    maxRequests: number,
    keyGenerator?: (req: Request) => string
): ReturnType<typeof rateLimit> {
    return rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        max: maxRequests,
        keyGenerator: keyGenerator || ((req: Request) => req.ip || 'unknown'),
        standardHeaders: true,
        legacyHeaders: false,
    });
}

