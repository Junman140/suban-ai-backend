import jwt from 'jsonwebtoken';

const ISSUER = 'likable-auth';
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface AuthTokenPayload {
    walletAddress: string;
    iat?: number;
    exp?: number;
    iss?: string;
}

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim() === '') {
        throw new Error('JWT_SECRET is not configured');
    }
    return secret;
}

export function signAuthToken(walletAddress: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): string {
    const secret = getJwtSecret();
    const payload: AuthTokenPayload = {
        walletAddress,
    };

    return jwt.sign(payload, secret, {
        expiresIn: ttlSeconds,
        issuer: ISSUER,
    });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
    try {
        const secret = getJwtSecret();
        const decoded = jwt.verify(token, secret, { issuer: ISSUER }) as AuthTokenPayload;

        if (!decoded.walletAddress) {
            return null;
        }

        return decoded;
    } catch {
        return null;
    }
}

