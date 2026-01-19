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
Object.defineProperty(exports, "__esModule", { value: true });
exports.solanaConnection = void 0;
const web3_js_1 = require("@solana/web3.js");
/**
 * Solana RPC Connection Service
 * Manages connection to Solana network with retry logic and fallback endpoints
 */
class SolanaConnectionService {
    constructor() {
        this.connection = null;
        this.commitment = 'confirmed';
        this.fallbackUrls = [
            'https://api.mainnet-beta.solana.com', // Public RPC (rate limited)
            'https://solana-mainnet.g.alchemy.com/v2/demo', // Alchemy demo (requires API key)
            'https://rpc.ankr.com/solana', // Ankr public RPC
            'https://solana.public-rpc.com', // Public RPC alternative
        ];
        this.currentUrlIndex = 0;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.rpcUrl = process.env.SOLANA_RPC_URL || this.fallbackUrls[0];
        // Initialize connection asynchronously
        this.initializeConnection().catch(error => {
            console.error('Failed to initialize Solana connection:', error);
        });
    }
    /**
     * Get connection with health check and automatic retry
     */
    getConnectionHealthy() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.connection) {
                yield this.initializeConnection();
            }
            try {
                // Health check
                yield this.connection.getVersion();
                return this.connection;
            }
            catch (error) {
                console.warn('Connection unhealthy, attempting reconnection...');
                yield this.initializeConnection();
                return this.connection;
            }
        });
    }
    /**
     * Initialize connection to Solana RPC
     */
    initializeConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.connection = new web3_js_1.Connection(this.rpcUrl, {
                    commitment: this.commitment,
                    confirmTransactionInitialTimeout: 60000,
                });
                // Test connection
                yield this.connection.getVersion();
                console.log(` Connected to Solana RPC: ${this.rpcUrl}`);
            }
            catch (error) {
                console.error(' Failed to connect to primary Solana RPC:', error);
                yield this.tryFallback();
            }
        });
    }
    /**
     * Try fallback RPC endpoints if primary fails
     * Implements retry logic with exponential backoff
     */
    tryFallback() {
        return __awaiter(this, void 0, void 0, function* () {
            for (let i = 0; i < this.fallbackUrls.length; i++) {
                const url = this.fallbackUrls[i];
                try {
                    const testConnection = new web3_js_1.Connection(url, {
                        commitment: this.commitment,
                        confirmTransactionInitialTimeout: 60000,
                    });
                    // Test the connection
                    yield testConnection.getVersion();
                    this.connection = testConnection;
                    this.rpcUrl = url;
                    this.currentUrlIndex = i;
                    this.retryCount = 0;
                    console.log(` Connected to fallback RPC: ${url}`);
                    return;
                }
                catch (error) {
                    console.error(` Fallback RPC ${url} failed:`, error);
                    // Continue to next fallback
                }
            }
            throw new Error('All Solana RPC endpoints failed');
        });
    }
    /**
     * Retry connection with exponential backoff
     */
    retryWithBackoff(operation_1) {
        return __awaiter(this, arguments, void 0, function* (operation, delayMs = 1000) {
            try {
                return yield operation();
            }
            catch (error) {
                if (this.retryCount >= this.maxRetries) {
                    // Try switching to next RPC endpoint
                    this.retryCount = 0;
                    this.currentUrlIndex = (this.currentUrlIndex + 1) % this.fallbackUrls.length;
                    this.rpcUrl = this.fallbackUrls[this.currentUrlIndex];
                    this.connection = new web3_js_1.Connection(this.rpcUrl, {
                        commitment: this.commitment,
                        confirmTransactionInitialTimeout: 60000,
                    });
                    throw error;
                }
                this.retryCount++;
                const backoffDelay = delayMs * Math.pow(2, this.retryCount - 1);
                console.warn(` Retrying in ${backoffDelay}ms (attempt ${this.retryCount}/${this.maxRetries})...`);
                yield this.delay(backoffDelay);
                return this.retryWithBackoff(operation, delayMs);
            }
        });
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get the active connection (synchronous, use getConnectionHealthy for async with health check)
     */
    getConnection() {
        if (!this.connection) {
            // Synchronous fallback - connection should be initialized in constructor
            this.connection = new web3_js_1.Connection(this.rpcUrl, {
                commitment: this.commitment,
                confirmTransactionInitialTimeout: 60000,
            });
        }
        return this.connection;
    }
    /**
     * Test connection health
     */
    testConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const connection = yield this.getConnectionHealthy();
                const version = yield connection.getVersion();
                console.log(` Solana RPC healthy. Version: ${version['solana-core']}`);
                this.retryCount = 0; // Reset retry count on successful connection
                return true;
            }
            catch (error) {
                console.error(' Solana RPC health check failed:', error);
                // Try to reconnect
                try {
                    yield this.initializeConnection();
                    return true;
                }
                catch (reconnectError) {
                    return false;
                }
            }
        });
    }
    /**
     * Start periodic health monitoring
     */
    startHealthMonitoring(intervalMs = 60000) {
        setInterval(() => __awaiter(this, void 0, void 0, function* () {
            const isHealthy = yield this.testConnection();
            if (!isHealthy) {
                console.warn('⚠️  Solana RPC connection is unhealthy. Some features may be degraded.');
            }
        }), intervalMs);
    }
    /**
     * Get current slot (for monitoring)
     */
    getCurrentSlot() {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = this.getConnection();
            return yield connection.getSlot();
        });
    }
}
// Singleton instance
exports.solanaConnection = new SolanaConnectionService();
exports.default = exports.solanaConnection;
