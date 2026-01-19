"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = exports.verifyAdmin = exports.verifyWallet = void 0;
const web3_js_1 = require("@solana/web3.js");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
/**
 * Verify wallet signature authentication
 * For routes that require wallet verification, expects:
 * - walletAddress in body/headers
 * - signature and message in headers (optional, can be done client-side)
 */
const verifyWallet = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const walletAddress = req.body.walletAddress || req.headers['x-wallet-address'];
        if (!walletAddress) {
            return res.status(401).json({ error: 'Wallet address required' });
        }
        // Validate wallet address format (Solana public key)
        try {
            new web3_js_1.PublicKey(walletAddress);
        }
        catch (error) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }
        // Optional: Verify signature if provided
        const signature = req.headers['x-signature'];
        const message = req.headers['x-message'];
        if (signature && message) {
            const isValid = yield verifySignature(walletAddress, message, signature);
            if (!isValid) {
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }
        // Attach wallet address to request
        req.walletAddress = walletAddress;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Authentication failed', details: error.message });
    }
});
exports.verifyWallet = verifyWallet;
/**
 * Admin wallet verification middleware
 * Only allows requests from whitelisted admin wallet addresses
 */
const verifyAdmin = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        // First verify wallet
        yield (0, exports.verifyWallet)(req, res, () => { });
        if (!req.walletAddress) {
            return res.status(401).json({ error: 'Wallet address required' });
        }
        // Get admin wallet addresses from environment
        const adminWallets = ((_a = process.env.ADMIN_WALLET_ADDRESSES) === null || _a === void 0 ? void 0 : _a.split(',')) || [];
        if (adminWallets.length === 0) {
            console.warn('No admin wallets configured. Admin endpoints are unprotected.');
            return next();
        }
        // Check if wallet is in admin list
        const isAdmin = adminWallets.some(adminAddr => adminAddr.trim().toLowerCase() === req.walletAddress.toLowerCase());
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Admin authentication failed', details: error.message });
    }
});
exports.verifyAdmin = verifyAdmin;
/**
 * Verify Solana wallet signature
 */
function verifySignature(walletAddress, message, signature) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const publicKey = new web3_js_1.PublicKey(walletAddress);
            const signatureBytes = Buffer.from(signature, 'base64');
            const messageBytes = Buffer.from(message, 'utf8');
            // Verify signature using nacl (tweetnacl)
            return tweetnacl_1.default.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes());
        }
        catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    });
}
/**
 * Legacy protect middleware (deprecated - use verifyWallet instead)
 * Kept for backward compatibility but should be replaced
 */
const protect = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    // For now, just verify wallet address exists
    // Full signature verification can be added later
    const walletAddress = req.body.walletAddress || req.headers['x-wallet-address'];
    if (!walletAddress) {
        return res.status(401).json({ error: 'Wallet address required' });
    }
    try {
        new web3_js_1.PublicKey(walletAddress);
        req.walletAddress = walletAddress;
        next();
    }
    catch (error) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
    }
});
exports.protect = protect;
