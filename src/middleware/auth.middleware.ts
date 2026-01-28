import { Request, Response, NextFunction } from 'express';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import mongoose from 'mongoose';
import User from '../models/user.model';
import { verifyAuthToken } from '../utils/authToken';

/**
 * Wallet-based authentication middleware
 * Verifies wallet address signatures for authentication
 */

// Extend Express Request to include wallet address
declare global {
    namespace Express {
        interface Request {
            walletAddress?: string;
        }
    }
}

/**
 * Verify wallet signature authentication
 * For routes that require wallet verification, expects:
 * - walletAddress in body/headers
 * - signature and message in headers (optional, can be done client-side)
 */
export const verifyWallet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const walletAddress = req.body.walletAddress || req.headers['x-wallet-address'] as string;

        if (!walletAddress) {
            return res.status(401).json({ error: 'Wallet address required' });
        }

        // Validate wallet address format (Solana public key)
        try {
            new PublicKey(walletAddress);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        // Optional: Verify signature if provided
        const signature = req.headers['x-signature'] as string;
        const message = req.headers['x-message'] as string;

        if (signature && message) {
            const isValid = await verifySignature(walletAddress, message, signature);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        // Attach wallet address to request
        req.walletAddress = walletAddress;
        next();
    } catch (error: any) {
        res.status(401).json({ error: 'Authentication failed', details: error.message });
    }
};

/**
 * Token-based authentication middleware
 * Reads JWT auth token from Authorization header and rehydrates walletAddress
 */
export const verifyTokenAuth = async (req: Request, res: Response, next: NextFunction) => {
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

        req.walletAddress = payload.walletAddress;
        next();
    } catch (error: any) {
        res.status(401).json({ error: 'Authentication failed', details: error.message });
    }
};

/**
 * Check if a wallet address is an admin user
 * Checks MongoDB first, then falls back to environment variable
 */
export const isAdminUser = async (walletAddress: string): Promise<boolean> => {
    try {
        // Check MongoDB if connected
        if (mongoose.connection.readyState === 1) {
            const user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
            if (user && user.isAdmin) {
                return true;
            }
        }

        // Fallback to environment variable
        const adminWallets = process.env.ADMIN_WALLET_ADDRESSES?.split(',') || [];
        return adminWallets.some(
            adminAddr => adminAddr.trim().toLowerCase() === walletAddress.toLowerCase()
        );
    } catch (error) {
        console.error('Error checking admin status:', error);
        // Fallback to environment variable on error
        const adminWallets = process.env.ADMIN_WALLET_ADDRESSES?.split(',') || [];
        return adminWallets.some(
            adminAddr => adminAddr.trim().toLowerCase() === walletAddress.toLowerCase()
        );
    }
};

/**
 * Admin wallet verification middleware
 * Only allows requests from whitelisted admin wallet addresses
 */
export const verifyAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // First verify wallet
        await verifyWallet(req, res, () => {});

        if (!req.walletAddress) {
            return res.status(401).json({ error: 'Wallet address required' });
        }

        const isAdmin = await isAdminUser(req.walletAddress);

        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        next();
    } catch (error: any) {
        res.status(401).json({ error: 'Admin authentication failed', details: error.message });
    }
};

/**
 * Verify Solana wallet signature
 */
async function verifySignature(
    walletAddress: string,
    message: string,
    signature: string
): Promise<boolean> {
    try {
        const publicKey = new PublicKey(walletAddress);
        const signatureBytes = Buffer.from(signature, 'base64');
        const messageBytes = Buffer.from(message, 'utf8');

        // Verify signature using nacl (tweetnacl)
        return nacl.sign.detached.verify(
            messageBytes,
            signatureBytes,
            publicKey.toBytes()
        );
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}

/**
 * Legacy protect middleware (deprecated - use verifyWallet instead)
 * Kept for backward compatibility but should be replaced
 */
export const protect = async (req: Request, res: Response, next: NextFunction) => {
    // For now, just verify wallet address exists
    // Full signature verification can be added later
    const walletAddress = req.body.walletAddress || req.headers['x-wallet-address'] as string;

    if (!walletAddress) {
        return res.status(401).json({ error: 'Wallet address required' });
    }

    try {
        new PublicKey(walletAddress);
        req.walletAddress = walletAddress;
        next();
    } catch (error) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
    }
};
