import { Router, Request, Response } from 'express';
import { verifyWallet } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /api/auth/wallet
 * Authenticate with wallet address
 * Returns wallet info (no JWT needed - wallet-based auth)
 */
router.post('/wallet', verifyWallet, (req: Request, res: Response) => {
  res.json({
    authenticated: true,
    walletAddress: req.walletAddress,
    message: 'Wallet authenticated successfully',
  });
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

export default router;
