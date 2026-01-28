import { signAuthToken, verifyAuthToken } from './authToken';

describe('authToken helpers', () => {
    const OLD_ENV = process.env;

    beforeAll(() => {
        process.env = { ...OLD_ENV, JWT_SECRET: 'test-secret' };
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('signs and verifies a valid token', () => {
        const walletAddress = 'test-wallet-address';
        const token = signAuthToken(walletAddress, 60); // 60s TTL
        const payload = verifyAuthToken(token);

        expect(payload).not.toBeNull();
        expect(payload!.walletAddress).toBe(walletAddress);
    });

    it('returns null for invalid token', () => {
        const payload = verifyAuthToken('invalid.token.here');
        expect(payload).toBeNull();
    });
});

