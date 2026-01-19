"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const logger_1 = __importStar(require("./utils/logger"));
// Load environment variables
dotenv_1.default.config();
// Validate environment variables
const env_validation_1 = require("./config/env.validation");
const envValidation = env_validation_1.envValidator.validate();
if (!envValidation.isValid) {
    console.error(env_validation_1.envValidator.getReport());
    console.error(' Environment validation failed. Server will not start.');
    process.exit(1);
}
// Log warnings if any
if (envValidation.warnings.length > 0) {
    console.warn(env_validation_1.envValidator.getReport());
}
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Rate limiting (apply globally)
const rateLimit_middleware_1 = require("./middleware/rateLimit.middleware");
app.use('/api', rateLimit_middleware_1.generalRateLimiter);
// Structured logging middleware (before routes)
app.use(logger_1.requestLoggerMiddleware);
// Optional: Use morgan for HTTP request logging (can be disabled if using structured logger)
if (process.env.USE_MORGAN !== 'false') {
    app.use((0, morgan_1.default)('dev'));
}
// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/justin_lee_ai';
mongoose_1.default.connect(MONGODB_URI)
    .then(() => logger_1.default.info('MongoDB Connected', { uri: MONGODB_URI.replace(/\/\/.*@/, '//***@') }))
    .catch((err) => logger_1.default.error('MongoDB Connection Error', { error: err.message }));
// Routes (Placeholders)
app.get('/', (req, res) => {
    res.send('AI Justin Lee API is running');
});
// Import Routes
const auth_routes_1 = __importDefault(require("./api/auth.routes"));
const chat_routes_1 = __importDefault(require("./api/chat.routes"));
const voice_routes_1 = __importDefault(require("./api/voice.routes"));
const token_routes_1 = __importDefault(require("./api/token.routes"));
// Use Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/chat', chat_routes_1.default);
app.use('/api/voice', voice_routes_1.default);
app.use('/api/token', token_routes_1.default);
// Initialize Solana services
const price_oracle_service_1 = __importDefault(require("./services/solana/price-oracle.service"));
const connection_service_1 = __importDefault(require("./services/solana/connection.service"));
function initializeSolanaServices() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            logger_1.default.info('Initializing Solana services...');
            // Test connection
            const isHealthy = yield connection_service_1.default.testConnection();
            if (!isHealthy) {
                logger_1.default.warn('Solana connection unhealthy, but continuing...');
            }
            // Start health monitoring (check every 60 seconds)
            connection_service_1.default.startHealthMonitoring(60000);
            // Initialize price oracle
            yield price_oracle_service_1.default.initialize();
            // Set up periodic price updates (every 2 minutes)
            setInterval(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    yield price_oracle_service_1.default.fetchCurrentPrice();
                }
                catch (error) {
                    logger_1.default.error('Failed to update price', { error: error.message });
                }
            }), 2 * 60 * 1000);
            // Initialize automated settlement
            yield initializeAutomatedSettlement();
            logger_1.default.info('Solana services initialized successfully');
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Solana services', { error: error.message });
        }
    });
}
function initializeAutomatedSettlement() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settlementService = (yield Promise.resolve().then(() => __importStar(require('./services/solana/settlement.service')))).settlementService;
            const intervalMinutes = parseInt(process.env.SETTLEMENT_INTERVAL_MINUTES || '60');
            const thresholdTokens = parseFloat(process.env.SETTLEMENT_THRESHOLD_TOKENS || '1000');
            logger_1.default.info('Initializing automated settlement', {
                intervalMinutes,
                thresholdTokens,
            });
            // Check for threshold-based settlement every 5 minutes
            setInterval(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const { balanceTracker } = yield Promise.resolve().then(() => __importStar(require('./services/solana/balance-tracker.service')));
                    const unsettledRecords = yield balanceTracker.getUnsettledRecords(1000);
                    const pendingAmount = unsettledRecords.reduce((sum, record) => sum + record.tokensBurned, 0);
                    if (pendingAmount >= thresholdTokens) {
                        logger_1.default.info('Settlement threshold reached, triggering settlement', {
                            pendingAmount,
                            thresholdTokens,
                        });
                        yield settlementService.triggerManualSettlement();
                    }
                }
                catch (error) {
                    logger_1.default.error('Automated settlement check failed', { error: error.message });
                }
            }), 5 * 60 * 1000); // Check every 5 minutes
            // Scheduled settlement at regular intervals
            setInterval(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    logger_1.default.info('Scheduled settlement triggered');
                    yield settlementService.executeBatchSettlement();
                }
                catch (error) {
                    logger_1.default.error('Scheduled settlement failed', { error: error.message });
                }
            }), intervalMinutes * 60 * 1000);
            logger_1.default.info('Automated settlement initialized');
        }
        catch (error) {
            logger_1.default.error('Failed to initialize automated settlement', { error: error.message });
        }
    });
}
// Error handling middleware (must be last)
app.use(logger_1.errorLoggerMiddleware);
// Start Server
app.listen(PORT, () => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.default.info(`Server started`, { port: PORT, env: process.env.NODE_ENV || 'development' });
    console.log(`🚀 Server running on port ${PORT}`);
    yield initializeSolanaServices();
}));
