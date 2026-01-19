import { TokenBalance, ITokenBalance } from '../../models/TokenBalance';
import { UsageRecord } from '../../models/UsageRecord';
import priceOracle from './price-oracle.service';

/**
 * Balance Tracker Service
 * Manages user token balances and deductions
 */
class BalanceTrackerService {
  /**
   * Get user balance
   */
  public async getBalance(walletAddress: string): Promise<ITokenBalance> {
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
  }

  /**
   * Record a deposit
   */
  public async recordDeposit(
    walletAddress: string,
    amount: number,
    txHash: string
  ): Promise<ITokenBalance> {
    const balance = await this.getBalance(walletAddress);

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
    const balance = await this.getBalance(walletAddress);

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
   * Check if user has sufficient balance
   */
  public async hasSufficientBalance(
    walletAddress: string,
    requiredAmount: number
  ): Promise<boolean> {
    const balance = await this.getBalance(walletAddress);
    return balance.currentBalance >= requiredAmount;
  }

  /**
   * Get usage history for a wallet
   */
  public async getUsageHistory(
    walletAddress: string,
    limit: number = 50
  ): Promise<any[]> {
    const records = await UsageRecord.find({ walletAddress })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return records;
  }

  /**
   * Get total statistics
   */
  public async getTotalStats(): Promise<{
    totalDeposited: number;
    totalConsumed: number;
    totalUsers: number;
  }> {
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
  }

  /**
   * Get unsettled usage records (for batch settlement)
   */
  public async getUnsettledRecords(limit: number = 100): Promise<any[]> {
    return await UsageRecord.find({ settled: false })
      .sort({ timestamp: 1 })
      .limit(limit)
      .lean();
  }

  /**
   * Mark records as settled
   */
  public async markAsSettled(recordIds: string[], txHash: string): Promise<void> {
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
