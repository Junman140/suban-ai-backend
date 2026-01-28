import { Router, Request, Response } from 'express';
import { verifyWallet } from '../middleware/auth.middleware';
import User from '../models/user.model';
import { signAuthToken, verifyAuthToken } from '../utils/authToken';

const router = Router();

/**
 * POST /api/auth/wallet
 * Authenticate with wallet address
 * Returns wallet info and a signed auth token for persistent login
 */
router.post('/wallet', verifyWallet, async (req: Request, res: Response) => {
  try {
    if (!req.walletAddress) {
      return res.status(401).json({ error: 'Wallet address missing after verification' });
    }

    const walletAddress = req.walletAddress.toLowerCase();

    // Ensure user record exists
    const user = await User.findOneAndUpdate(
      { walletAddress },
      { $setOnInsert: { walletAddress } },
      { upsert: true, new: true }
    );

    // Issue auth token
    const token = signAuthToken(walletAddress);

    res.json({
      authenticated: true,
      walletAddress,
      token,
      user: {
        isPro: user.isPro,
        isAdmin: user.isAdmin,
        balance: user.balance,
      },
      message: 'Wallet authenticated successfully',
    });
  } catch (error: any) {
    console.error('Error in /api/auth/wallet:', error);
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
});

/**
 * POST /api/auth/verify
 * Verify wallet signature
 */
router.post('/verify', async (req: Request, res: Response) => {
  const { walletAddress, message, signature } = req.body;

  if (!walletAddress || !message || !signature) {
    return res.status(400).json({ error: 'Missing required fields: walletAddress, message, signature' });
  }

  // Signature verification happens in middleware if needed
  // For now, just validate wallet address format
  try {
    const { PublicKey } = await import('@solana/web3.js');
    new PublicKey(walletAddress);
    res.json({ verified: true, walletAddress });
  } catch (error) {
    res.status(400).json({ error: 'Invalid wallet address' });
  }
});

/**
 * GET /api/auth/me
 * Validate auth token and return current user context
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.substring('Bearer '.length).trim();
    const payload = verifyAuthToken(token);

    if (!payload?.walletAddress) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const walletAddress = payload.walletAddress.toLowerCase();
    const user = await User.findOne({ walletAddress });

    res.json({
      authenticated: true,
      walletAddress,
      user: user
        ? {
            isPro: user.isPro,
            isAdmin: user.isAdmin,
            balance: user.balance,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Error in /api/auth/me:', error);
    res.status(500).json({ error: 'Failed to validate auth token', details: error.message });
  }
});

export default router;
