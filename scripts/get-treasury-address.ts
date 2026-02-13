#!/usr/bin/env npx ts-node
/**
 * Print the backend wallet public key (from BACKEND_WALLET_PRIVATE_KEY).
 * Use this to set TREASURY_WALLET_ADDRESS = backend wallet for a single-wallet setup.
 *
 * Run: npx ts-node scripts/get-treasury-address.ts
 * Or:  pnpm exec ts-node scripts/get-treasury-address.ts
 */
import 'dotenv/config';
import { Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
// @ts-ignore
import bs58 from 'bs58';
// @ts-ignore
import * as bip39 from 'bip39';
// @ts-ignore
import { derivePath } from 'ed25519-hd-key';

function loadBackendWallet(): Keypair | null {
  const privateKeyEnv = process.env.BACKEND_WALLET_PRIVATE_KEY;
  if (!privateKeyEnv) {
    console.error('BACKEND_WALLET_PRIVATE_KEY not set.');
    return null;
  }

  try {
    let privateKeyBytes: Uint8Array;
    const normalizedInput = privateKeyEnv.trim().toLowerCase().replace(/\s+/g, ' ');
    const words = normalizedInput.split(' ');

    if (words.length === 12 || words.length === 24) {
      if (!bip39.validateMnemonic(normalizedInput)) {
        throw new Error('Invalid mnemonic');
      }
      const seed = bip39.mnemonicToSeedSync(normalizedInput);
      const derivation = (process.env.BACKEND_WALLET_DERIVATION || 'bip44').toLowerCase();
      if (derivation === 'legacy') {
        return Keypair.fromSeed(seed.subarray(0, 32));
      }
      const derived = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
      const derivedSeed = Buffer.from(derived.key);
      return Keypair.fromSeed(derivedSeed);
    }

    if (privateKeyEnv.startsWith('[')) {
      privateKeyBytes = Uint8Array.from(JSON.parse(privateKeyEnv));
    } else if (privateKeyEnv.includes(',') && !privateKeyEnv.includes(' ')) {
      privateKeyBytes = Uint8Array.from(privateKeyEnv.split(',').map((s: string) => parseInt(s.trim(), 10)));
    } else {
      privateKeyBytes = bs58.decode(privateKeyEnv);
    }

    if (privateKeyBytes.length !== 64 && privateKeyBytes.length !== 32) {
      throw new Error(`Invalid key length: ${privateKeyBytes.length}`);
    }

    return Keypair.fromSecretKey(privateKeyBytes);
  } catch (e: any) {
    console.error('Failed to load wallet:', e.message);
    return null;
  }
}

async function main() {
  const wallet = loadBackendWallet();
  if (!wallet) process.exit(1);

  const pubkey = wallet.publicKey.toString();
  console.log('Backend wallet public key:', pubkey);
  console.log('');
  console.log('Use this as TREASURY_WALLET_ADDRESS for single-wallet setup:');
  console.log('TREASURY_WALLET_ADDRESS=' + pubkey);
  console.log('');

  const mint = process.env.TOKEN_MINT_ADDRESS;
  if (mint) {
    try {
      const mintPk = new PublicKey(mint);
      const ata = await getAssociatedTokenAddress(mintPk, wallet.publicKey, false, TOKEN_PROGRAM_ID);
      console.log('Treasury ATA (for this mint):', ata.toString());
    } catch (e) {
      console.warn('Could not derive ATA:', (e as Error).message);
    }
  }
}

main();
