import axios from 'axios';

/**
 * Price Oracle Service
 * Fetches token price from Jupiter API and calculates TWAP (Time-Weighted Average Price)
 */
class PriceOracleService {
  private jupiterApiUrl: string;
  private jupiterApiKey: string | undefined;
  private tokenMintAddress: string;
  private priceCache: { price: number; timestamp: number }[] = [];
  private twapWindowMinutes: number;
  private burnFloor: number;
  private burnCeiling: number;
  private cacheExpiryMs: number = 60000; // 1 minute cache

  constructor() {
    // Normalize Jupiter API URL
    const envUrl = process.env.JUPITER_API_URL || 'https://price.jup.ag/v4';
    this.jupiterApiUrl = envUrl.replace(/\/$/, ''); // Remove trailing slash
    
    // Get Jupiter API key if available (required for Ultra API)
    this.jupiterApiKey = process.env.JUPITER_API_KEY;
    
    this.tokenMintAddress = process.env.TOKEN_MINT_ADDRESS || '';
    this.twapWindowMinutes = parseInt(process.env.TWAP_WINDOW_MINUTES || '10');
    this.burnFloor = parseFloat(process.env.BURN_FLOOR || '0.05');
    this.burnCeiling = parseFloat(process.env.BURN_CEILING || '50');

    // Validate token mint address on construction
    if (!this.tokenMintAddress) {
      console.warn('  TOKEN_MINT_ADDRESS not configured. Price oracle will not work.');
    }
    
    console.log(`  Jupiter Price API URL: ${this.jupiterApiUrl}`);
    if (this.jupiterApiKey) {
      console.log('  Jupiter API Key: Configured');
    } else {
      console.warn('  Jupiter API Key: Not configured (may be required for some endpoints)');
    }
  }

  /**
   * Fetch current token price from Jupiter
   */
  public async fetchCurrentPrice(): Promise<number> {
    try {
      if (!this.tokenMintAddress) {
        throw new Error('TOKEN_MINT_ADDRESS not configured');
      }

      let apiUrl = this.jupiterApiUrl;
      
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (this.jupiterApiKey && apiUrl.includes('api.jup.ag')) {
        headers['X-API-Key'] = this.jupiterApiKey;
      }
      
      const response = await axios.get(apiUrl, {
        params: { ids: this.tokenMintAddress },
        timeout: 10000,
        headers,
      });

      if (!response.data) {
        throw new Error('No data received from Jupiter API');
      }

      const priceData = response.data.data ? response.data.data[this.tokenMintAddress] : response.data[this.tokenMintAddress];
      
      if (!priceData) {
        throw new Error(`Price data not found for token: ${this.tokenMintAddress}`);
      }

      const priceValue = priceData.usdPrice !== undefined ? priceData.usdPrice : priceData.price;

      if (priceValue === undefined || priceValue === null) {
        throw new Error('Price field missing in Jupiter API response');
      }

      const price = parseFloat(priceValue);
      if (isNaN(price) || price <= 0) {
        throw new Error(`Invalid price value: ${priceValue}`);
      }
      
      this.priceCache.push({ price, timestamp: Date.now() });
      this.cleanCache();

      console.log(` Current token price: $${price}`);
      return price;
    } catch (error: any) {
      console.error(' Failed to fetch token price:', error.message);
      
      if (this.priceCache.length > 0) {
        const lastPrice = this.priceCache[this.priceCache.length - 1].price;
        console.warn(` Using cached price: $${lastPrice}`);
        return lastPrice;
      }

      throw error;
    }
  }

  /**
   * Calculate TWAP (Time-Weighted Average Price)
   */
  public getTWAPPrice(): number {
    if (this.priceCache.length === 0) {
      throw new Error('No price data available for TWAP calculation');
    }

    const now = Date.now();
    const windowMs = this.twapWindowMinutes * 60 * 1000;

    // Filter prices within TWAP window
    const relevantPrices = this.priceCache.filter(
      (entry) => now - entry.timestamp <= windowMs
    );

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
  public calculateTokenBurn(usdCost: number): number {
    const tokenPrice = this.getTWAPPrice();
    
    if (tokenPrice <= 0) {
      throw new Error('Invalid token price');
    }

    // Raw calculation
    const rawBurn = usdCost / tokenPrice;

    // Apply floor and ceiling
    const clampedBurn = Math.max(
      this.burnFloor,
      Math.min(rawBurn, this.burnCeiling)
    );

    console.log(` Burn calculation: $${usdCost} @ $${tokenPrice} = ${clampedBurn} tokens`);
    return clampedBurn;
  }

  /**
   * Clean old cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    const windowMs = this.twapWindowMinutes * 60 * 1000;
    
    this.priceCache = this.priceCache.filter(
      (entry) => now - entry.timestamp <= windowMs * 2 // Keep 2x window for safety
    );
  }

  /**
   * Get cached price (for quick reads without API call)
   */
  public getCachedPrice(): number | null {
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
  public async initialize(): Promise<void> {
    try {
      await this.fetchCurrentPrice();
      console.log(' Price oracle initialized');
    } catch (error) {
      console.error(' Failed to initialize price oracle:', error);
    }
  }
}

// Singleton instance
export const priceOracle = new PriceOracleService();
export default priceOracle;
