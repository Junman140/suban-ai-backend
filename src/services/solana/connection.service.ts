import { Connection, Commitment } from '@solana/web3.js';

/**
 * Solana RPC Connection Service
 * Manages connection to Solana network with retry logic and fallback endpoints
 */
class SolanaConnectionService {
  private connection: Connection | null = null;
  private rpcUrl: string;
  private commitment: Commitment = 'confirmed';
  private fallbackUrls: string[] = [
    'https://api.mainnet-beta.solana.com', // Public RPC (rate limited)
    'https://solana-mainnet.g.alchemy.com/v2/demo', // Alchemy demo (requires API key)
    'https://rpc.ankr.com/solana', // Ankr public RPC
    'https://solana.public-rpc.com', // Public RPC alternative
  ];
  private currentUrlIndex: number = 0;
  private retryCount: number = 0;
  private maxRetries: number = 3;

  constructor() {
    this.rpcUrl = process.env.SOLANA_RPC_URL || this.fallbackUrls[0];
    // Initialize connection asynchronously
    this.initializeConnection().catch(error => {
      console.error('Failed to initialize Solana connection:', error);
    });
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
   * Initialize connection to Solana RPC
   */
  private async initializeConnection(): Promise<void> {
    try {
      this.connection = new Connection(this.rpcUrl, {
        commitment: this.commitment,
        confirmTransactionInitialTimeout: 60000,
      });
      
      // Test connection
      await this.connection.getVersion();
      console.log(` Connected to Solana RPC: ${this.rpcUrl}`);
    } catch (error) {
      console.error(' Failed to connect to primary Solana RPC:', error);
      await this.tryFallback();
    }
  }

  /**
   * Try fallback RPC endpoints if primary fails
   * Implements retry logic with exponential backoff
   */
  private async tryFallback(): Promise<void> {
    for (let i = 0; i < this.fallbackUrls.length; i++) {
      const url = this.fallbackUrls[i];
      try {
        const testConnection = new Connection(url, {
          commitment: this.commitment,
          confirmTransactionInitialTimeout: 60000,
        });
        
        // Test the connection
        await testConnection.getVersion();
        
        this.connection = testConnection;
        this.rpcUrl = url;
        this.currentUrlIndex = i;
        this.retryCount = 0;
        console.log(` Connected to fallback RPC: ${url}`);
        return;
      } catch (error) {
        console.error(` Fallback RPC ${url} failed:`, error);
        // Continue to next fallback
      }
    }
    throw new Error('All Solana RPC endpoints failed');
  }

  /**
   * Retry connection with exponential backoff
   */
  private async retryWithBackoff(operation: () => Promise<any>, delayMs: number = 1000): Promise<any> {
    try {
      return await operation();
    } catch (error: any) {
      if (this.retryCount >= this.maxRetries) {
        // Try switching to next RPC endpoint
        this.retryCount = 0;
        this.currentUrlIndex = (this.currentUrlIndex + 1) % this.fallbackUrls.length;
        this.rpcUrl = this.fallbackUrls[this.currentUrlIndex];
        this.connection = new Connection(this.rpcUrl, {
          commitment: this.commitment,
          confirmTransactionInitialTimeout: 60000,
        });
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
      // Synchronous fallback - connection should be initialized in constructor
      this.connection = new Connection(this.rpcUrl, {
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
        console.warn('⚠️  Solana RPC connection is unhealthy. Some features may be degraded.');
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
