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

// Chat endpoint rate limiter (15 requests per minute per wallet - cost effective)
export const chatRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 15, // Reduced from 30 to control token consumption
    message: 'Too many chat requests, please slow down to conserve tokens.',
    keyGenerator: (req: Request) => {
        // Rate limit by wallet address if available, otherwise by IP
        return req.body?.walletAddress || req.headers['x-wallet-address'] || req.ip || 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many requests. Please slow down to conserve tokens.',
            retryAfter: 60, // seconds
        });
    },
});

// Voice endpoint rate limiter (8 requests per minute per wallet - more expensive, cost effective)
export const voiceRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 8, // Reduced from 10 to control token consumption
    message: 'Too many voice requests, please slow down to conserve tokens.',
    keyGenerator: (req: Request) => {
        return req.body?.walletAddress || req.headers['x-wallet-address'] || req.ip || 'unknown';
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many voice requests. Please slow down to conserve tokens.',
            retryAfter: 60, // seconds
        });
    },
});

// Settlement trigger rate limiter (5 requests per hour - admin only)
export const settlementRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: 'Too many settlement triggers, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Meme generation rate limiter (10 per minute per IP - cost effective)
export const memeRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many meme generation requests, please try again in a minute.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: 'Too many meme generations. Please try again in a minute.',
            retryAfter: 60,
        });
    },
});

// Deposit pay rate limiter (10 per minute per wallet - prevent abuse)
export const depositPayRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req: Request) => (req as any).body?.walletAddress || req.ip || 'unknown',
    message: 'Too many deposit attempts. Please try again in a minute.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Deposit scan rate limiter (1 request per 10 seconds per IP or wallet - avoid RPC abuse)
export const scanRateLimiter = rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 1,
    keyGenerator: (req: Request) => {
        return (req as any).body?.walletAddress || req.ip || 'unknown';
    },
    message: 'Scan rate limited. Please wait before checking again.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
        res.status(429).json({
            error: 'Too many requests',
            message: 'Please wait a few seconds before checking for deposits again.',
            retryAfter: 10,
        });
    },
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

