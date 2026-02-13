import mongoose from 'mongoose';
import { TokenBalance, ITokenBalance, ITransaction } from '../../models/TokenBalance';
import { UsageRecord } from '../../models/UsageRecord';
import priceOracle from './price-oracle.service';

/**
 * Plain balance data type (without Mongoose Document methods)
 */
type TokenBalanceData = {
  walletAddress: string;
  depositedAmount: number;
  consumedAmount: number;
  currentBalance: number;
  lastUpdated: Date;
  transactions: ITransaction[];
};

/**
 * Balance Tracker Service
 * Manages user token balances and deductions
 */
class BalanceTrackerService {
  /**
   * Check if MongoDB is connected
   */
  private isMongoConnected(): boolean {
    return mongoose.connection.readyState === 1; // 1 = connected
  }

  /**
   * Get default balance object (when MongoDB is not available)
   */
  private getDefaultBalance(walletAddress: string): TokenBalanceData {
    return {
      walletAddress,
      depositedAmount: 0,
      consumedAmount: 0,
      currentBalance: 0,
      transactions: [],
      lastUpdated: new Date(),
    };
  }

  /**
   * Get user balance
   */
  public async getBalance(walletAddress: string): Promise<ITokenBalance | TokenBalanceData> {
    // Check if MongoDB is connected
    if (!this.isMongoConnected()) {
      console.warn('MongoDB not connected, returning default balance');
      return this.getDefaultBalance(walletAddress);
    }

    try {
      let balance = await TokenBalance.findOne({ walletAddress });

      if (!balance) {
        // Create new balance entry
        balance = new TokenBalance({
          walletAddress,
          depositedAmount: 0,
          consumedAmount: 0,
          currentBalance: 0,
          transactions: [],
        });
        await balance.save();
      }

      return balance;
    } catch (error: any) {
      // If MongoDB operation fails, return default balance
      if (error.name === 'MongooseError' || error.message?.includes('buffering timed out')) {
        console.warn('MongoDB operation failed, returning default balance:', error.message);
        return this.getDefaultBalance(walletAddress);
      }
      throw error;
    }
  }

  /**
   * Record a deposit
   */
  public async recordDeposit(
    walletAddress: string,
    amount: number,
    txHash: string
  ): Promise<ITokenBalance> {
    if (!this.isMongoConnected()) {
      throw new Error('MongoDB not connected. Cannot record deposit.');
    }

    const balance = await this.getBalance(walletAddress);
    
    // Ensure we have a Mongoose document, not a plain object
    if (!(balance instanceof TokenBalance)) {
      throw new Error('MongoDB not connected. Cannot record deposit.');
    }

    balance.depositedAmount += amount;
    balance.currentBalance += amount;
    balance.transactions.push({
      type: 'deposit',
      amount,
      txHash,
      timestamp: new Date(),
    });

    await balance.save();
    console.log(` Recorded deposit: ${amount} tokens for ${walletAddress}`);
    return balance;
  }

  /**
   * Deduct tokens for usage
   */
  public async deductTokens(
    walletAddress: string,
    amount: number,
    requestType: 'chat' | 'voice',
    usdCost: number
  ): Promise<ITokenBalance> {
    if (!this.isMongoConnected()) {
      throw new Error('MongoDB not connected. Cannot deduct tokens.');
    }

    const balance = await this.getBalance(walletAddress);
    
    // Ensure we have a Mongoose document, not a plain object
    if (!(balance instanceof TokenBalance)) {
      throw new Error('MongoDB not connected. Cannot deduct tokens.');
    }

    if (balance.currentBalance < amount) {
      throw new Error('Insufficient token balance');
    }

    balance.consumedAmount += amount;
    balance.currentBalance -= amount;
    balance.transactions.push({
      type: 'usage',
      amount: -amount, // Negative for deduction
      timestamp: new Date(),
      metadata: {
        requestType,
        usdCost,
      },
    });

    await balance.save();

    // Record usage for settlement
    const tokenPrice = priceOracle.getTWAPPrice();
    await UsageRecord.create({
      walletAddress,
      requestType,
      usdCost,
      tokenPrice,
      tokensBurned: amount,
      settled: false,
    });

    console.log(` Deducted ${amount} tokens from ${walletAddress}`);
    return balance;
  }

  /**
   * Check if user has sufficient balance for a specific cost
   */
  public async hasSufficientBalance(
    walletAddress: string,
    requiredAmount: number
  ): Promise<boolean> {
    const balance = await this.getBalance(walletAddress);
    return balance.currentBalance >= requiredAmount;
  }

  /**
   * Check if user meets minimum deposit (USD value) to access chat/voice
   */
  public async hasMinimumDeposit(walletAddress: string): Promise<boolean> {
    const minUsd = parseFloat(process.env.MINIMUM_DEPOSIT_USD || '1');
    if (minUsd <= 0) return true;
    try {
      const balance = await this.getBalance(walletAddress);
      const tokenPrice = priceOracle.getTWAPPrice();
      const balanceUsd = balance.currentBalance * tokenPrice;
      return balanceUsd >= minUsd;
    } catch {
      return false;
    }
  }

  /**
   * Get balance in USD and min required
   */
  public async getBalanceUsdInfo(walletAddress: string): Promise<{
    balanceUsd: number;
    minDepositUsd: number;
    canAccess: boolean;
  }> {
    const minUsd = parseFloat(process.env.MINIMUM_DEPOSIT_USD || '1');
    let balanceUsd = 0;
    try {
      const balance = await this.getBalance(walletAddress);
      const tokenPrice = priceOracle.getTWAPPrice();
      balanceUsd = balance.currentBalance * tokenPrice;
    } catch {
      // ignore
    }
    return {
      balanceUsd,
      minDepositUsd: minUsd,
      canAccess: minUsd <= 0 || balanceUsd >= minUsd,
    };
  }

  /**
   * Get usage history for a wallet
   */
  public async getUsageHistory(
    walletAddress: string,
    limit: number = 50
  ): Promise<any[]> {
    if (!this.isMongoConnected()) {
      console.warn('MongoDB not connected, returning empty usage history');
      return [];
    }

    try {
      const records = await UsageRecord.find({ walletAddress })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return records;
    } catch (error: any) {
      if (error.name === 'MongooseError' || error.message?.includes('buffering timed out')) {
        console.warn('MongoDB operation failed, returning empty usage history:', error.message);
        return [];
      }
      throw error;
    }
  }

  /**
   * Get total statistics
   */
  public async getTotalStats(): Promise<{
    totalDeposited: number;
    totalConsumed: number;
    totalUsers: number;
  }> {
    if (!this.isMongoConnected()) {
      console.warn('MongoDB not connected, returning default stats');
      return {
        totalDeposited: 0,
        totalConsumed: 0,
        totalUsers: 0,
      };
    }

    try {
      const stats = await TokenBalance.aggregate([
        {
          $group: {
            _id: null,
            totalDeposited: { $sum: '$depositedAmount' },
            totalConsumed: { $sum: '$consumedAmount' },
            totalUsers: { $sum: 1 },
          },
        },
      ]);

      if (stats.length === 0) {
        return {
          totalDeposited: 0,
          totalConsumed: 0,
          totalUsers: 0,
        };
      }

      return stats[0];
    } catch (error: any) {
      if (error.name === 'MongooseError' || error.message?.includes('buffering timed out')) {
        console.warn('MongoDB operation failed, returning default stats:', error.message);
        return {
          totalDeposited: 0,
          totalConsumed: 0,
          totalUsers: 0,
        };
      }
      throw error;
    }
  }

  /**
   * Get unsettled usage records (for batch settlement)
   */
  public async getUnsettledRecords(limit: number = 100): Promise<any[]> {
    if (!this.isMongoConnected()) {
      console.warn('MongoDB not connected, returning empty unsettled records');
      return [];
    }

    try {
      return await UsageRecord.find({ settled: false })
        .sort({ timestamp: 1 })
        .limit(limit)
        .lean();
    } catch (error: any) {
      if (error.name === 'MongooseError' || error.message?.includes('buffering timed out')) {
        console.warn('MongoDB operation failed, returning empty unsettled records:', error.message);
        return [];
      }
      throw error;
    }
  }

  /**
   * Mark records as settled
   */
  public async markAsSettled(recordIds: string[], txHash: string): Promise<void> {
    if (!this.isMongoConnected()) {
      throw new Error('MongoDB not connected. Cannot mark records as settled.');
    }

    await UsageRecord.updateMany(
      { _id: { $in: recordIds } },
      { $set: { settled: true, txHash } }
    );
    console.log(` Marked ${recordIds.length} records as settled`);
  }
}

// Singleton instance
export const balanceTracker = new BalanceTrackerService();
export default balanceTracker;
