import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import balanceTracker from '../services/solana/balance-tracker.service';
import priceOracle from '../services/solana/price-oracle.service';
import settlementService from '../services/solana/settlement.service';
import transactionVerifier from '../services/solana/transaction-verifier.service';
import jupiterService from '../services/solana/jupiter.service';
import solanaConnection from '../services/solana/connection.service';
import { TokenBalance } from '../models/TokenBalance';
import { verifyAdmin } from '../middleware/auth.middleware';
import { settlementRateLimiter, costCalculationRateLimiter, scanRateLimiter, depositPayRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

const LIKA_DECIMALS_DEFAULT = 6;

/** In-memory cache for GET /token/config (zero RPC). TTL 5 minutes. */
let tokenConfigCache: { data: { treasuryWallet: string; treasuryAta: string; tokenMint: string; tokenDecimals: number }; expires: number } | null = null;
const TOKEN_CONFIG_CACHE_MS = 5 * 60 * 1000;

/**
 * GET /api/token/balance/:walletAddress
 * Get user token balance
 */
router.get('/balance/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    const balance = await balanceTracker.getBalance(walletAddress);

    res.json({
      walletAddress: balance.walletAddress,
      currentBalance: balance.currentBalance,
      depositedAmount: balance.depositedAmount,
      consumedAmount: balance.consumedAmount,
      lastUpdated: balance.lastUpdated,
    });
  } catch (error: any) {
    console.error('Error fetching balance:', error);
    // If it's a MongoDB timeout, return a more helpful error
    if (error.name === 'MongooseError' && error.message?.includes('buffering timed out')) {
      return res.status(503).json({ 
        error: 'Database temporarily unavailable',
        message: 'MongoDB connection timed out. Please check your database connection.'
      });
    }
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

/**
 * GET /api/token/price
 * Get current token price (TWAP)
 */
router.get('/price', costCalculationRateLimiter, async (req: Request, res: Response) => {
  try {
    // Try to get cached price first
    let price = priceOracle.getCachedPrice();

    if (!price) {
      // Fetch fresh price if cache is stale
      price = await priceOracle.fetchCurrentPrice();
    }

    const twapPrice = priceOracle.getTWAPPrice();

    res.json({
      currentPrice: price,
      twapPrice,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching price:', error);
    res.status(500).json({ error: 'Failed to fetch token price' });
  }
});

/**
 * GET /api/token/stats
 * Get public burn and usage statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const totalStats = await balanceTracker.getTotalStats();
    const settlementStats = await settlementService.getSettlementStats();

    res.json({
      totalUsers: totalStats.totalUsers,
      totalDeposited: totalStats.totalDeposited,
      totalConsumed: totalStats.totalConsumed,
      totalBurned: settlementStats.totalBurned,
      totalToTreasury: settlementStats.totalToTreasury,
      pendingSettlement: settlementStats.pendingSettlement,
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/token/config
 * Public config for building deposit transfer (treasury ATA, mint, decimals).
 * Zero RPC: uses env only and derived ATA so we do not hit Solana RPC (avoids 429).
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (tokenConfigCache && tokenConfigCache.expires > now) {
      return res.json(tokenConfigCache.data);
    }

    const tokenMint = process.env.TOKEN_MINT_ADDRESS;
    const treasuryWallet = process.env.TREASURY_WALLET_ADDRESS;

    if (!tokenMint || !treasuryWallet) {
      return res.status(503).json({
        error: 'Token or treasury not configured',
        message: 'TOKEN_MINT_ADDRESS and TREASURY_WALLET_ADDRESS must be set.',
      });
    }

    const mintPk = new PublicKey(tokenMint);
    const treasuryPk = new PublicKey(treasuryWallet);
    const treasuryAta = await getAssociatedTokenAddress(mintPk, treasuryPk);

    const tokenDecimals = parseInt(process.env.TOKEN_DECIMALS || '', 10) || LIKA_DECIMALS_DEFAULT;

    const data = {
      treasuryWallet,
      treasuryAta: treasuryAta.toString(),
      tokenMint,
      tokenDecimals,
    };
    tokenConfigCache = { data, expires: now + TOKEN_CONFIG_CACHE_MS };
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching token config:', error);
    res.status(500).json({ error: 'Failed to fetch token config' });
  }
});

/**
 * POST /api/token/deposit
 * Record a token deposit (after on-chain confirmation) — user received tokens (e.g. from swap).
 */
router.post('/deposit', async (req: Request, res: Response) => {
  try {
    const { walletAddress, amount, txHash } = req.body;

    if (!walletAddress || !amount || !txHash) {
      return res.status(400).json({
        error: 'Missing required fields: walletAddress, amount, txHash',
      });
    }

    // Verify transaction on-chain before recording (prevents fake deposits)
    const expectedTokenMint = process.env.TOKEN_MINT_ADDRESS;
    const verification = await transactionVerifier.verifyDepositTransaction(
      txHash,
      walletAddress,
      parseFloat(amount),
      expectedTokenMint
    );

    if (!verification.isValid) {
      return res.status(400).json({
        error: 'Transaction verification failed',
        details: verification.error,
      });
    }

    // Check for duplicate transaction (same txHash already processed)
    const existingTransaction = await TokenBalance.findOne({
      'transactions.txHash': txHash,
    });

    if (existingTransaction) {
      return res.status(400).json({
        error: 'Transaction has already been processed',
        txHash,
      });
    }

    // Use verified amount from blockchain (more accurate)
    const verifiedAmount = verification.actualAmount || parseFloat(amount);

    const balance = await balanceTracker.recordDeposit(
      walletAddress,
      verifiedAmount,
      txHash
    );

    res.json({
      success: true,
      balance: {
        currentBalance: balance.currentBalance,
        depositedAmount: balance.depositedAmount,
      },
    });
  } catch (error: any) {
    console.error('Error recording deposit:', error);
    res.status(500).json({ error: 'Failed to record deposit' });
  }
});

/**
 * POST /api/token/deposit/pay
 * Record a deposit after user paid to treasury (transfer from user wallet to treasury). Verifies treasury received from sender.
 */
router.post('/deposit/pay', depositPayRateLimiter, async (req: Request, res: Response) => {
  try {
    const { walletAddress, amount, txHash } = req.body;

    if (!walletAddress || !amount || !txHash) {
      return res.status(400).json({
        error: 'Missing required fields: walletAddress, amount, txHash',
      });
    }

    const tokenMint = process.env.TOKEN_MINT_ADDRESS;
    const treasuryWallet = process.env.TREASURY_WALLET_ADDRESS;
    if (!tokenMint || !treasuryWallet) {
      return res.status(503).json({
        error: 'Token or treasury not configured',
      });
    }

    const treasuryPk = new PublicKey(treasuryWallet);
    const mintPk = new PublicKey(tokenMint);
    const treasuryAta = await getAssociatedTokenAddress(mintPk, treasuryPk);

    const verification = await transactionVerifier.verifyDepositTransaction(
      txHash,
      treasuryAta.toString(),
      parseFloat(amount),
      tokenMint,
      { expectedSender: walletAddress }
    );

    if (!verification.isValid) {
      return res.status(400).json({
        error: 'Transaction verification failed',
        details: verification.error,
      });
    }

    const existingTransaction = await TokenBalance.findOne({
      'transactions.txHash': txHash,
    });
    if (existingTransaction) {
      return res.status(400).json({
        error: 'Transaction has already been processed',
        txHash,
      });
    }

    const verifiedAmount = verification.actualAmount ?? parseFloat(amount);
    const balance = await balanceTracker.recordDeposit(
      walletAddress,
      verifiedAmount,
      txHash
    );

    res.json({
      success: true,
      balance: {
        currentBalance: balance.currentBalance,
        depositedAmount: balance.depositedAmount,
      },
    });
  } catch (error: any) {
    console.error('Error recording deposit (pay):', error);
    res.status(500).json({ error: 'Failed to record deposit' });
  }
});

/**
 * POST /api/token/deposit/scan
 * Scan user ATA for recent incoming token transfers, verify and credit new ones.
 */
router.post('/deposit/scan', scanRateLimiter, async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid walletAddress',
      });
    }

    const tokenMint = process.env.TOKEN_MINT_ADDRESS;
    if (!tokenMint) {
      return res.status(503).json({
        error: 'Token mint not configured',
        message: 'TOKEN_MINT_ADDRESS is not set.',
      });
    }

    const connection = solanaConnection.getConnection();
    const mintPk = new PublicKey(tokenMint);
    const walletPk = new PublicKey(walletAddress);

    const userAta = await getAssociatedTokenAddress(mintPk, walletPk);
    const sigs = await connection.getSignaturesForAddress(userAta, { limit: 20 });

    const credited: Array<{ txHash: string; amount: number }> = [];
    let alreadyProcessed = 0;

    for (const { signature } of sigs) {
      const existing = await TokenBalance.findOne({ 'transactions.txHash': signature });
      if (existing) {
        alreadyProcessed += 1;
        continue;
      }

      const verification = await transactionVerifier.verifyDepositTransaction(
        signature,
        walletAddress,
        undefined,
        tokenMint
      );

      if (!verification.isValid || verification.actualAmount == null || verification.actualAmount <= 0) {
        continue;
      }

      await balanceTracker.recordDeposit(
        walletAddress,
        verification.actualAmount,
        signature
      );
      credited.push({ txHash: signature, amount: verification.actualAmount });
    }

    res.json({
      credited,
      alreadyProcessed,
    });
  } catch (error: any) {
    console.error('Error scanning deposits:', error);
    if (error.message?.includes('could not find account')) {
      return res.json({ credited: [], alreadyProcessed: 0 });
    }
    res.status(500).json({
      error: 'Failed to scan deposits',
      details: error.message,
    });
  }
});

/**
 * GET /api/token/usage-history/:walletAddress
 * Get usage history for a wallet
 */
router.get('/usage-history/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    const history = await balanceTracker.getUsageHistory(walletAddress, limit);

    res.json({
      walletAddress,
      history,
      count: history.length,
    });
  } catch (error: any) {
    console.error('Error fetching usage history:', error);
    res.status(500).json({ error: 'Failed to fetch usage history' });
  }
});

/**
 * GET /api/token/search
 * Search for tokens using Jupiter Ultra API
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = await jupiterService.searchTokens(query);

    res.json(results);
  } catch (error: any) {
    console.error('Error searching tokens:', error);
    res.status(500).json({ 
      error: 'Failed to search tokens',
      message: error.message 
    });
  }
});

/**
 * POST /api/token/settlement/trigger
 * Manually trigger settlement (admin only)
 */
// Settlement trigger is protected with admin auth and rate limiting
router.post('/settlement/trigger', settlementRateLimiter, verifyAdmin, async (req: Request, res: Response) => {
  try {
    await settlementService.triggerManualSettlement();

    res.json({
      success: true,
      message: 'Settlement triggered successfully',
    });
  } catch (error: any) {
    console.error('Error triggering settlement:', error);
    res.status(500).json({ error: 'Failed to trigger settlement' });
  }
});

export default router;
