import axios from 'axios';

/**
 * Jupiter Token Search Result Interface
 */
export interface JupiterTokenSearchResult {
    mint: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI?: string;
    marketCap?: number;
    organicScore?: number;
    holderCount?: number;
    description?: string;
    tags?: string[];
    extensions?: Record<string, any>;
}

/**
 * Jupiter Service
 * Handles interactions with Jupiter Ultra Swap API
 */
class JupiterService {
    private ultraApiUrl: string;
    private jupiterApiKey: string | undefined;

    constructor() {
        // Jupiter Ultra API base URL
        this.ultraApiUrl = 'https://api.jup.ag/ultra/v1';
        
        // Get Jupiter API key if available
        this.jupiterApiKey = process.env.JUPITER_API_KEY;

        if (this.jupiterApiKey) {
            console.log('  Jupiter Service: API Key configured');
        } else {
            console.warn('  Jupiter Service: API Key not configured. Search and other Ultra API features may fail.');
        }
    }

    /**
     * Search for a token by symbol, name, or mint address
     * @param query - Search term (symbol, name, or mint)
     * @returns Array of matching token information
     */
    public async searchTokens(query: string): Promise<JupiterTokenSearchResult[]> {
        try {
            if (!this.jupiterApiKey) {
                throw new Error('Jupiter API key is required for token search');
            }

            const response = await axios.get(`${this.ultraApiUrl}/search`, {
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
        } catch (error: any) {
            console.error('  Jupiter Search Error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.error || 'Failed to search for tokens via Jupiter');
        }
    }
}

// Singleton instance
export const jupiterService = new JupiterService();
export default jupiterService;
