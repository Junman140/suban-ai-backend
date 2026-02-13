import { Connection, Commitment } from '@solana/web3.js';

const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';

/**
 * Solana RPC Connection Service
 * Uses SOLANA_RPC_URL when set; does not fall back to public RPCs (they return 403/429 in production).
 */
class SolanaConnectionService {
  private connection: Connection | null = null;
  private rpcUrl: string;
  /** When true, only use SOLANA_RPC_URL — do not try public fallbacks (they are rate-limited). */
  private readonly useOnlyConfiguredRpc: boolean;
  private commitment: Commitment = 'confirmed';
  private fallbackUrls: string[] = [
    PUBLIC_RPC,
    'https://solana-mainnet.g.alchemy.com/v2/demo',
    'https://rpc.ankr.com/solana',
    'https://solana.public-rpc.com',
  ];
  private currentUrlIndex: number = 0;
  private retryCount: number = 0;
  private maxRetries: number = 3;

  constructor() {
    const envUrl = process.env.SOLANA_RPC_URL?.trim();
    this.useOnlyConfiguredRpc = !!envUrl;
    this.rpcUrl = envUrl || this.fallbackUrls[0];
    const host = this.rpcUrl.replace(/\?.*$/, '').replace(/^https?:\/\//, '');
    console.log(` SOLANA_RPC_URL env: ${this.useOnlyConfiguredRpc ? `set (${host})` : 'NOT SET'}`);
    if (this.useOnlyConfiguredRpc && this.rpcUrl === PUBLIC_RPC) {
      console.warn(' SOLANA_RPC_URL is the public endpoint. It will 403/429 in production.');
    } else if (!this.useOnlyConfiguredRpc) {
      console.warn(' Using public RPC. Set SOLANA_RPC_URL in Render → Environment for this service.');
    }
    this.initializeConnection().catch(error => {
      console.error('Failed to initialize Solana connection:', error);
    });
  }

  /** Use runtime env so Render-injected SOLANA_RPC_URL is used even if module loaded early. */
  private getRpcUrl(): string {
    const url = process.env.SOLANA_RPC_URL?.trim();
    return url || this.fallbackUrls[0];
  }

  /**
   * Get connection with health check and automatic retry
   */
  public async getConnectionHealthy(): Promise<Connection> {
    if (!this.connection) {
      await this.initializeConnection();
    }

    try {
      // Health check
      await this.connection!.getVersion();
      return this.connection!;
    } catch (error) {
      console.warn('Connection unhealthy, attempting reconnection...');
      await this.initializeConnection();
      return this.connection!;
    }
  }

  /**
   * Initialize connection to Solana RPC. When using configured RPC, retry with backoff before failing.
   */
  private async initializeConnection(): Promise<void> {
    const url = this.getRpcUrl();
    const maxAttempts = this.useOnlyConfiguredRpc ? 4 : 1; // 1 initial + 3 retries when configured
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.connection = new Connection(url, {
          commitment: this.commitment,
          confirmTransactionInitialTimeout: 60000,
        });
        await this.connection.getVersion();
        this.rpcUrl = url;
        console.log(` Connected to Solana RPC: ${url.replace(/\?.*$/, '')}`);
        this.retryCount = 0;
        return;
      } catch (error) {
        console.error(` Failed to connect to Solana RPC (attempt ${attempt}/${maxAttempts}):`, error);
        if (attempt < maxAttempts) {
          const delayMs = 2000 * Math.pow(2, attempt - 1);
          console.warn(` Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
        } else {
          await this.tryFallback();
        }
      }
    }
  }

  /**
   * Try fallback RPC endpoints if primary fails.
   * When SOLANA_RPC_URL is set we do not use public fallbacks (they return 403/429).
   */
  private async tryFallback(): Promise<void> {
    const hasConfiguredRpc = !!process.env.SOLANA_RPC_URL?.trim();
    if (hasConfiguredRpc) {
      throw new Error(
        'Solana RPC failed (403/429). Check SOLANA_RPC_URL in Render Environment (e.g. Helius). Public fallbacks are not used when SOLANA_RPC_URL is set.'
      );
    }
    for (let i = 0; i < this.fallbackUrls.length; i++) {
      const url = this.fallbackUrls[i];
      try {
        const testConnection = new Connection(url, {
          commitment: this.commitment,
          confirmTransactionInitialTimeout: 60000,
        });
        await testConnection.getVersion();
        this.connection = testConnection;
        this.rpcUrl = url;
        this.currentUrlIndex = i;
        this.retryCount = 0;
        console.log(` Connected to fallback RPC: ${url}`);
        return;
      } catch (error) {
        console.error(` Fallback RPC ${url} failed:`, error);
      }
    }
    throw new Error('All Solana RPC endpoints failed');
  }

  /**
   * Retry with exponential backoff. When useOnlyConfiguredRpc we do not switch to another URL.
   */
  private async retryWithBackoff(operation: () => Promise<any>, delayMs: number = 1000): Promise<any> {
    try {
      return await operation();
    } catch (error: any) {
      if (this.retryCount >= this.maxRetries) {
        this.retryCount = 0;
        if (!this.useOnlyConfiguredRpc) {
          this.currentUrlIndex = (this.currentUrlIndex + 1) % this.fallbackUrls.length;
          this.rpcUrl = this.fallbackUrls[this.currentUrlIndex];
          this.connection = new Connection(this.rpcUrl, {
            commitment: this.commitment,
            confirmTransactionInitialTimeout: 60000,
          });
        }
        throw error;
      }
      this.retryCount++;
      const backoffDelay = delayMs * Math.pow(2, this.retryCount - 1);
      console.warn(` Retrying in ${backoffDelay}ms (attempt ${this.retryCount}/${this.maxRetries})...`);
      await this.delay(backoffDelay);
      return this.retryWithBackoff(operation, delayMs);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the active connection (synchronous, use getConnectionHealthy for async with health check)
   */
  public getConnection(): Connection {
    if (!this.connection) {
      const url = this.getRpcUrl();
      this.connection = new Connection(url, {
        commitment: this.commitment,
        confirmTransactionInitialTimeout: 60000,
      });
    }
    return this.connection;
  }

  /**
   * Test connection health
   */
  public async testConnection(): Promise<boolean> {
    try {
      const connection = await this.getConnectionHealthy();
      const version = await connection.getVersion();
      console.log(` Solana RPC healthy. Version: ${version['solana-core']}`);
      this.retryCount = 0; // Reset retry count on successful connection
      return true;
    } catch (error) {
      console.error(' Solana RPC health check failed:', error);
      // Try to reconnect
      try {
        await this.initializeConnection();
        return true;
      } catch (reconnectError) {
        return false;
      }
    }
  }

  /**
   * Start periodic health monitoring
   */
  public startHealthMonitoring(intervalMs: number = 60000): void {
    setInterval(async () => {
      const isHealthy = await this.testConnection();
      if (!isHealthy) {
        console.warn('Solana RPC connection is unhealthy. Some features may be degraded.');
      }
    }, intervalMs);
  }

  /**
   * Get current slot (for monitoring)
   */
  public async getCurrentSlot(): Promise<number> {
    const connection = this.getConnection();
    return await connection.getSlot();
  }
}

// Singleton instance
export const solanaConnection = new SolanaConnectionService();
export default solanaConnection;
