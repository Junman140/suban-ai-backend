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
exports.priceOracle = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Price Oracle Service
 * Fetches token price from Jupiter API and calculates TWAP (Time-Weighted Average Price)
 */
class PriceOracleService {
    constructor() {
        this.priceCache = [];
        this.cacheExpiryMs = 60000; // 1 minute cache
        // Normalize Jupiter API URL
        const envUrl = process.env.JUPITER_API_URL || 'https://price.jup.ag/v4';
        this.jupiterApiUrl = envUrl.replace(/\/$/, ''); // Remove trailing slash
        // Get Jupiter API key if available (required for Ultra API)
        this.jupiterApiKey = process.env.JUPITER_API_KEY;
        this.tokenMintAddress = process.env.TOKEN_MINT_ADDRESS || '';
        this.twapWindowMinutes = parseInt(process.env.TWAP_WINDOW_MINUTES || '10');
        this.burnFloor = parseFloat(process.env.BURN_FLOOR || '0.05');
        this.burnCeiling = parseFloat(process.env.BURN_CEILING || '50');
        // Add fallback price (defaults to 0.001 if not set)
        const fallback = process.env.FALLBACK_TOKEN_PRICE;
        if (fallback) {
            const price = parseFloat(fallback);
            if (!isNaN(price) && price > 0) {
                console.log(`  Price Oracle: Using initial fallback price of $${price}`);
                this.priceCache.push({ price, timestamp: Date.now() });
            }
        }
        // Validate token mint address on construction
        if (!this.tokenMintAddress) {
            console.warn('  TOKEN_MINT_ADDRESS not configured. Price oracle will not work.');
        }
        console.log(`  Jupiter Price API URL: ${this.jupiterApiUrl}`);
        if (this.jupiterApiKey) {
            console.log('  Jupiter API Key: Configured');
        }
        else {
            console.warn('  Jupiter API Key: Not configured (may be required for some endpoints)');
        }
    }
    /**
     * Fetch current token price from Jupiter
     */
    fetchCurrentPrice() {
        return __awaiter(this, void 0, void 0, function* () {
            const endpoints = [
                this.jupiterApiUrl,
                'https://api.jup.ag/price/v2',
                'https://price.jup.ag/v6/price',
                'https://price.jup.ag/v4/price'
            ];
            // Remove duplicates and normalize
            const uniqueEndpoints = [...new Set(endpoints.filter(Boolean))].map(url => url.replace(/\/$/, ''));
            let lastError = null;
            for (const baseUrl of uniqueEndpoints) {
                try {
                    let apiUrl = baseUrl;
                    // Construct correct path if only base is provided
                    if (apiUrl === 'https://api.jup.ag') {
                        apiUrl = 'https://api.jup.ag/price/v2';
                    }
                    else if (apiUrl === 'https://price.jup.ag') {
                        apiUrl = 'https://price.jup.ag/v6/price';
                    }
                    else if (!apiUrl.includes('/price') && !apiUrl.includes('ultra')) {
                        if (apiUrl.match(/\/v\d+$/)) {
                            apiUrl = `${apiUrl}/price`;
                        }
                        else {
                            // Default fallback for unknown bases
                            apiUrl = `${apiUrl}/price`;
                        }
                    }
                    const headers = { 'Accept': 'application/json' };
                    if (this.jupiterApiKey && apiUrl.includes('api.jup.ag')) {
                        headers['X-API-Key'] = this.jupiterApiKey;
                    }
                    const response = yield axios_1.default.get(apiUrl, {
                        params: { ids: this.tokenMintAddress },
                        timeout: 5000,
                        headers,
                    });
                    if (!response.data || (!response.data.data && !response.data[this.tokenMintAddress])) {
                        continue;
                    }
                    const priceData = response.data.data ? response.data.data[this.tokenMintAddress] : response.data[this.tokenMintAddress];
                    if (!priceData || (priceData.price === undefined && priceData.price === null)) {
                        continue;
                    }
                    const price = parseFloat(priceData.price);
                    if (isNaN(price) || price <= 0)
                        continue;
                    this.priceCache.push({ price, timestamp: Date.now() });
                    this.cleanCache();
                    console.log(` Current token price from ${baseUrl}: $${price}`);
                    return price;
                }
                catch (error) {
                    lastError = error;
                    continue; // Try next endpoint
                }
            }
            console.error(' Failed to fetch token price from all endpoints. Last error:', lastError === null || lastError === void 0 ? void 0 : lastError.message);
            // Return last known price if available
            if (this.priceCache.length > 0) {
                const lastPrice = this.priceCache[this.priceCache.length - 1].price;
                console.warn(` Using cached price: $${lastPrice}`);
                return lastPrice;
            }
            throw new Error(`Unable to fetch token price from any endpoint: ${lastError === null || lastError === void 0 ? void 0 : lastError.message}`);
        });
    }
    /**
     * Calculate TWAP (Time-Weighted Average Price)
     */
    getTWAPPrice() {
        if (this.priceCache.length === 0) {
            throw new Error('No price data available for TWAP calculation');
        }
        const now = Date.now();
        const windowMs = this.twapWindowMinutes * 60 * 1000;
        // Filter prices within TWAP window
        const relevantPrices = this.priceCache.filter((entry) => now - entry.timestamp <= windowMs);
        if (relevantPrices.length === 0) {
            // Return most recent price if no data in window
            return this.priceCache[this.priceCache.length - 1].price;
        }
        // Calculate simple average (can be enhanced to true time-weighted)
        const sum = relevantPrices.reduce((acc, entry) => acc + entry.price, 0);
        const twap = sum / relevantPrices.length;
        console.log(` TWAP (${this.twapWindowMinutes}min): $${twap}`);
        return twap;
    }
    /**
     * Calculate tokens to burn based on USD cost
     * @param usdCost - Cost in USD
     * @returns Number of tokens to burn
     */
    calculateTokenBurn(usdCost) {
        const tokenPrice = this.getTWAPPrice();
        if (tokenPrice <= 0) {
            throw new Error('Invalid token price');
        }
        // Raw calculation
        const rawBurn = usdCost / tokenPrice;
        // Apply floor and ceiling
        const clampedBurn = Math.max(this.burnFloor, Math.min(rawBurn, this.burnCeiling));
        console.log(` Burn calculation: $${usdCost} @ $${tokenPrice} = ${clampedBurn} tokens`);
        return clampedBurn;
    }
    /**
     * Clean old cache entries
     */
    cleanCache() {
        const now = Date.now();
        const windowMs = this.twapWindowMinutes * 60 * 1000;
        this.priceCache = this.priceCache.filter((entry) => now - entry.timestamp <= windowMs * 2 // Keep 2x window for safety
        );
    }
    /**
     * Get cached price (for quick reads without API call)
     */
    getCachedPrice() {
        if (this.priceCache.length === 0) {
            return null;
        }
        const lastEntry = this.priceCache[this.priceCache.length - 1];
        const age = Date.now() - lastEntry.timestamp;
        if (age > this.cacheExpiryMs) {
            return null; // Cache expired
        }
        return lastEntry.price;
    }
    /**
     * Initialize price oracle (fetch initial price)
     */
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.fetchCurrentPrice();
                console.log(' Price oracle initialized');
            }
            catch (error) {
                console.error(' Failed to initialize price oracle:', error);
            }
        });
    }
}
// Singleton instance
exports.priceOracle = new PriceOracleService();
exports.default = exports.priceOracle;
