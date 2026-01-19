"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.generateRequestId = generateRequestId;
exports.createRequestLogger = createRequestLogger;
exports.logRequest = logRequest;
exports.logResponse = logResponse;
exports.logError = logError;
exports.logLLMCall = logLLMCall;
exports.logTokenOperation = logTokenOperation;
exports.requestLoggerMiddleware = requestLoggerMiddleware;
exports.errorLoggerMiddleware = errorLoggerMiddleware;
const winston_1 = __importDefault(require("winston"));
const uuid_1 = require("uuid");
/**
 * Structured Logging Utility
 * Provides request IDs, structured logging, and error tracking
 */
// Custom format for request ID
const requestIdFormat = winston_1.default.format((info) => {
    if (!info.requestId) {
        info.requestId = 'no-request-id';
    }
    return info;
});
// Create logger instance
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(requestIdFormat(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json()),
    defaultMeta: { service: 'justin-lee-ai-backend' },
    transports: [
        // Write all logs to console
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf((_a) => {
                var { timestamp, level, message, requestId } = _a, meta = __rest(_a, ["timestamp", "level", "message", "requestId"]);
                let msg = `${timestamp} [${level}]`;
                if (requestId && requestId !== 'no-request-id') {
                    msg += ` [${requestId}]`;
                }
                msg += `: ${message}`;
                if (Object.keys(meta).length > 0) {
                    msg += ` ${JSON.stringify(meta)}`;
                }
                return msg;
            })),
        }),
        // Write errors to error.log file
        new winston_1.default.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: winston_1.default.format.combine(requestIdFormat(), winston_1.default.format.timestamp(), winston_1.default.format.json()),
        }),
        // Write all logs to combined.log
        new winston_1.default.transports.File({
            filename: 'logs/combined.log',
            format: winston_1.default.format.combine(requestIdFormat(), winston_1.default.format.timestamp(), winston_1.default.format.json()),
        }),
    ],
});
exports.logger = logger;
// Create logs directory if it doesn't exist
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logsDir = path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
/**
 * Generate a request ID
 */
function generateRequestId() {
    return (0, uuid_1.v4)();
}
/**
 * Create a logger instance with a request ID
 */
function createRequestLogger(requestId) {
    return logger.child({ requestId });
}
exports.default = logger;
/**
 * Log API request
 */
function logRequest(requestId, method, path, walletAddress) {
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
function logResponse(requestId, statusCode, duration) {
    logger.info('API Response', {
        requestId,
        statusCode,
        duration: `${duration}ms`,
    });
}
/**
 * Log error with context
 */
function logError(requestId, error, context) {
    logger.error('Error occurred', Object.assign({ requestId, error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
        } }, context));
}
/**
 * Log LLM API call
 */
function logLLMCall(requestId, provider, model, inputTokens, outputTokens, duration) {
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
function logTokenOperation(requestId, operation, walletAddress, amount, txHash) {
    logger.info('Token Operation', {
        requestId,
        operation,
        walletAddress,
        amount,
        txHash,
    });
}
function requestLoggerMiddleware(req, res, next) {
    var _a;
    const requestId = generateRequestId();
    req.requestId = requestId;
    req.startTime = Date.now();
    // Log request
    logRequest(requestId, req.method, req.path, ((_a = req.body) === null || _a === void 0 ? void 0 : _a.walletAddress) || req.headers['x-wallet-address']);
    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        logResponse(requestId, res.statusCode, duration);
    });
    next();
}
/**
 * Error handler middleware with logging
 */
function errorLoggerMiddleware(error, req, res, next) {
    const requestId = req.requestId || 'no-request-id';
    logError(requestId, error, {
        method: req.method,
        path: req.path,
        body: req.body,
        query: req.query,
    });
    next(error);
}
