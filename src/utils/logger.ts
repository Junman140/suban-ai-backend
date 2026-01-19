import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

/**
 * Structured Logging Utility
 * Provides request IDs, structured logging, and error tracking
 */

// Custom format for request ID
const requestIdFormat = winston.format((info) => {
    if (!info.requestId) {
        info.requestId = 'no-request-id';
    }
    return info;
});

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        requestIdFormat(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'justin-lee-ai-backend' },
    transports: [
        // Write all logs to console
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
                    let msg = `${timestamp} [${level}]`;
                    if (requestId && requestId !== 'no-request-id') {
                        msg += ` [${requestId}]`;
                    }
                    msg += `: ${message}`;
                    
                    if (Object.keys(meta).length > 0) {
                        msg += ` ${JSON.stringify(meta)}`;
                    }
                    return msg;
                })
            ),
        }),
        // Write errors to error.log file
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            format: winston.format.combine(
                requestIdFormat(),
                winston.format.timestamp(),
                winston.format.json()
            ),
        }),
        // Write all logs to combined.log
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            format: winston.format.combine(
                requestIdFormat(),
                winston.format.timestamp(),
                winston.format.json()
            ),
        }),
    ],
});

// Create logs directory if it doesn't exist
import fs from 'fs';
import path from 'path';
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Generate a request ID
 */
export function generateRequestId(): string {
    return uuidv4();
}

/**
 * Create a logger instance with a request ID
 */
export function createRequestLogger(requestId: string) {
    return logger.child({ requestId });
}

/**
 * Default logger (use when no request context)
 */
export { logger };
export default logger;

/**
 * Log API request
 */
export function logRequest(requestId: string, method: string, path: string, walletAddress?: string) {
    logger.info('API Request', {
        requestId,
        method,
        path,
        walletAddress,
    });
}

/**
 * Log API response
 */
export function logResponse(requestId: string, statusCode: number, duration: number) {
    logger.info('API Response', {
        requestId,
        statusCode,
        duration: `${duration}ms`,
    });
}

/**
 * Log error with context
 */
export function logError(requestId: string, error: Error, context?: Record<string, any>) {
    logger.error('Error occurred', {
        requestId,
        error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
        },
        ...context,
    });
}

/**
 * Log LLM API call
 */
export function logLLMCall(
    requestId: string,
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    duration: number
) {
    logger.info('LLM API Call', {
        requestId,
        provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        duration: `${duration}ms`,
    });
}

/**
 * Log token operation
 */
export function logTokenOperation(
    requestId: string,
    operation: 'deposit' | 'deduct' | 'settlement',
    walletAddress: string,
    amount: number,
    txHash?: string
) {
    logger.info('Token Operation', {
        requestId,
        operation,
        walletAddress,
        amount,
        txHash,
    });
}

/**
 * Express middleware to add request ID and logging
 */
import { Request, Response, NextFunction } from 'express';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
    const requestId = generateRequestId();
    (req as any).requestId = requestId;
    (req as any).startTime = Date.now();

    // Log request
    logRequest(
        requestId,
        req.method,
        req.path,
        req.body?.walletAddress || req.headers['x-wallet-address'] as string
    );

    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - (req as any).startTime;
        logResponse(requestId, res.statusCode, duration);
    });

    next();
}

/**
 * Error handler middleware with logging
 */
export function errorLoggerMiddleware(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
) {
    const requestId = (req as any).requestId || 'no-request-id';
    
    logError(requestId, error, {
        method: req.method,
        path: req.path,
        body: req.body,
        query: req.query,
    });

    next(error);
}

