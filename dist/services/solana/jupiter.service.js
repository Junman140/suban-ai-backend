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
exports.jupiterService = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Jupiter Service
 * Handles interactions with Jupiter Ultra Swap API
 */
class JupiterService {
    constructor() {
        // Jupiter Ultra API base URL
        this.ultraApiUrl = 'https://api.jup.ag/ultra/v1';
        // Get Jupiter API key if available
        this.jupiterApiKey = process.env.JUPITER_API_KEY;
        if (this.jupiterApiKey) {
            console.log('  Jupiter Service: API Key configured');
        }
        else {
            console.warn('  Jupiter Service: API Key not configured. Search and other Ultra API features may fail.');
        }
    }
    /**
     * Search for a token by symbol, name, or mint address
     * @param query - Search term (symbol, name, or mint)
     * @returns Array of matching token information
     */
    searchTokens(query) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                if (!this.jupiterApiKey) {
                    throw new Error('Jupiter API key is required for token search');
                }
                const response = yield axios_1.default.get(`${this.ultraApiUrl}/search`, {
                    params: {
                        query: query
                    },
                    headers: {
                        'x-api-key': this.jupiterApiKey,
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                });
                // The Ultra search API returns an array of mints directly or within a data field
                // According to documentation provided, it returns an array of mints along with their information.
                return response.data;
            }
            catch (error) {
                console.error('  Jupiter Search Error:', ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
                throw new Error(((_c = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) || 'Failed to search for tokens via Jupiter');
            }
        });
    }
}
// Singleton instance
exports.jupiterService = new JupiterService();
exports.default = exports.jupiterService;
