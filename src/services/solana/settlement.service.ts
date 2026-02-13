import { PublicKey, Transaction, SystemProgram, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createBurnCheckedInstruction, createTransferCheckedInstruction } from '@solana/spl-token';
import { solanaConnection } from './connection.service';
import { balanceTracker } from './balance-tracker.service';
// @ts-ignore - bs58 doesn't have types
import bs58 from 'bs58';
// @ts-ignore - bip39 doesn't have types
import * as bip39 from 'bip39';
// @ts-ignore - ed25519-hd-key doesn't have types
import { derivePath } from 'ed25519-hd-key';

/**
 * Settlement Service
 * Handles batch settlement of token burns and treasury transfers (50/50 split)
 */
class SettlementService {
  private tokenMintAddress: string;
  private treasuryWalletAddress: string;
  private settlementProgramId: string;
  private backendWallet: Keypair | null = null;
  private isSettling: boolean = false;

  constructor() {
    this.tokenMintAddress = process.env.TOKEN_MINT_ADDRESS || '';
    this.treasuryWalletAddress = process.env.TREASURY_WALLET_ADDRESS || '';
    this.settlementProgramId = process.env.SETTLEMENT_PROGRAM_ID || '';
    this.loadBackendWallet();
  }

  /**
   * Load backend wallet keypair from environment variable
   * Supports multiple formats:
   * 1. 12-word mnemonic seed phrase (space-separated)
   * 2. BASE58 encoded private key (64 bytes when decoded)
   * 3. JSON array format: [1,2,3,...]
   * 4. Comma-separated values: 1,2,3,...
   */
  private loadBackendWallet(): void {
    const privateKeyEnv = process.env.BACKEND_WALLET_PRIVATE_KEY;
    if (!privateKeyEnv) {
      console.warn('BACKEND_WALLET_PRIVATE_KEY not set. Settlement will not work.');
      return;
    }

    try {
      let privateKeyBytes: Uint8Array;
      
      // Check if it's a mnemonic phrase (12 or 24 words separated by spaces)
      // Normalize: trim, lowercase, and collapse multiple spaces
      const normalizedInput = privateKeyEnv.trim().toLowerCase().replace(/\s+/g, ' ');
      const words = normalizedInput.split(' ');
      
      if (words.length === 12 || words.length === 24) {
        const mnemonic = normalizedInput;
        
        // Validate mnemonic (BIP39 validation)
        if (!bip39.validateMnemonic(mnemonic)) {
          // Check if words are valid BIP39 words for better error messages
          const wordList = bip39.wordlists.english;
          const invalidWords: string[] = [];
          words.forEach((word, index) => {
            if (!wordList.includes(word)) {
              invalidWords.push(`Word ${index + 1}: "${word}"`);
            }
          });
          
          if (invalidWords.length > 0) {
            throw new Error(`Invalid BIP39 words found: ${invalidWords.join(', ')}. Please check your mnemonic phrase.`);
          }
          throw new Error(`Invalid mnemonic phrase. Expected ${words.length === 12 ? 12 : 24} words, but checksum validation failed.`);
        }
        
        // Convert mnemonic to seed
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        
        const derivation = (process.env.BACKEND_WALLET_DERIVATION || 'bip44').toLowerCase();
        if (derivation === 'legacy') {
          // Legacy: first 32 bytes of BIP39 seed (Solana CLI, some older wallets)
          this.backendWallet = Keypair.fromSeed(seed.subarray(0, 32));
          console.log(`Backend wallet loaded from mnemonic (legacy): ${this.backendWallet.publicKey.toString()}`);
        } else {
          // BIP44: m/44'/501'/0'/0' (Phantom, Solflare, modern wallets)
          const derived = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
          const derivedSeed = Buffer.from(derived.key);
          this.backendWallet = Keypair.fromSeed(derivedSeed);
          console.log(`Backend wallet loaded from mnemonic (bip44): ${this.backendWallet.publicKey.toString()}`);
        }
        return;
      }
      
      // Try to parse as JSON array first (e.g., [1,2,3,...])
      if (privateKeyEnv.startsWith('[')) {
        try {
          const keyArray = JSON.parse(privateKeyEnv);
          privateKeyBytes = Uint8Array.from(keyArray);
        } catch {
          throw new Error('Failed to parse JSON array format');
        }
      }
      // Try to parse as comma-separated values
      else if (privateKeyEnv.includes(',') && !privateKeyEnv.includes(' ')) {
        try {
          const keyArray = privateKeyEnv.split(',').map(s => parseInt(s.trim(), 10));
          privateKeyBytes = Uint8Array.from(keyArray);
        } catch {
          throw new Error('Failed to parse comma-separated format');
        }
      }
      // Otherwise, treat as BASE58 encoded
      else {
        privateKeyBytes = bs58.decode(privateKeyEnv);
      }

      // Solana Keypair expects 64 bytes (32-byte private key + 32-byte public key)
      // or just 32 bytes (private key only)
      if (privateKeyBytes.length !== 64 && privateKeyBytes.length !== 32) {
        throw new Error(`Invalid key length: expected 32 or 64 bytes, got ${privateKeyBytes.length}`);
      }

      this.backendWallet = Keypair.fromSecretKey(privateKeyBytes);
      console.log(`Backend wallet loaded: ${this.backendWallet.publicKey.toString()}`);
    } catch (error: any) {
      console.error('Failed to load backend wallet:', error.message);
      console.warn('BACKEND_WALLET_PRIVATE_KEY format options:');
      console.warn('  1. 12-word mnemonic seed phrase (space-separated)');
      console.warn('  2. BASE58 encoded private key (64 bytes)');
      console.warn('  3. JSON array [1,2,3,...]');
      console.warn('  4. Comma-separated values 1,2,3,...');
      console.warn('Settlement features will not be available until a valid key is provided.');
      // Don't throw - allow server to start without wallet, but settlement won't work
    }
  }

  /**
   * Execute batch settlement
   * This will be called periodically (e.g., every hour or when threshold is reached)
   */
  public async executeBatchSettlement(): Promise<void> {
    if (this.isSettling) {
      console.log(' Settlement already in progress, skipping...');
      return;
    }

    this.isSettling = true;

    try {
      // Get unsettled records
      const unsettledRecords = await balanceTracker.getUnsettledRecords(100);

      if (unsettledRecords.length === 0) {
      console.log(' No unsettled records to process');
        return;
      }

      // Calculate total tokens to settle
      const totalTokens = unsettledRecords.reduce(
        (sum, record) => sum + record.tokensBurned,
        0
      );

      console.log(` Settling ${unsettledRecords.length} records (${totalTokens} tokens)`);

      // Split 50/50
      const burnAmount = totalTokens / 2;
      const treasuryAmount = totalTokens / 2;

      console.log(` Burn: ${burnAmount} tokens`);
      console.log(` Treasury: ${treasuryAmount} tokens`);

      // Execute on-chain settlement
      // NOTE: This is a placeholder. Actual implementation requires:
      // 1. Settlement program deployed on Solana
      // 2. Backend wallet with authority to call the program
      // 3. Proper transaction signing
      
      const txHash = await this.executeOnChainSettlement(burnAmount, treasuryAmount);

      // Mark records as settled
      const recordIds = unsettledRecords.map((r) => r._id.toString());
      await balanceTracker.markAsSettled(recordIds, txHash);

      console.log(` Settlement complete. TX: ${txHash}`);
    } catch (error) {
      console.error(' Settlement failed:', error);
      throw error;
    } finally {
      this.isSettling = false;
    }
  }

  /**
   * Execute on-chain settlement transaction
   * Burns 50% of tokens and transfers 50% to treasury
   */
  private async executeOnChainSettlement(
    burnAmount: number,
    treasuryAmount: number
  ): Promise<string> {
    if (!this.backendWallet) {
      throw new Error('Backend wallet not loaded. Cannot execute settlement.');
    }

    if (!this.tokenMintAddress) {
      throw new Error('TOKEN_MINT_ADDRESS not configured');
    }

    if (!this.treasuryWalletAddress) {
      throw new Error('TREASURY_WALLET_ADDRESS not configured');
    }

    const connection = solanaConnection.getConnection();
    const mintPublicKey = new PublicKey(this.tokenMintAddress);
    const treasuryPublicKey = new PublicKey(this.treasuryWalletAddress);
    const backendPublicKey = this.backendWallet.publicKey;

    try {
      // Get backend's token account
      const backendTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        backendPublicKey
      );

      // Get treasury's token account
      const treasuryTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        treasuryPublicKey
      );

      // Get mint decimals first
      let tokenDecimals = 9;
      try {
        const mintInfo = await connection.getParsedAccountInfo(mintPublicKey);
        if (mintInfo.value && 'data' in mintInfo.value && mintInfo.value.data && 'parsed' in mintInfo.value.data) {
          tokenDecimals = (mintInfo.value.data.parsed as any).info.decimals || 9;
        }
      } catch (error) {
        console.warn('Could not fetch mint info, using default 9 decimals');
      }

      // Check backend has sufficient balance
      let backendBalance = 0;
      try {
        const account = await getAccount(connection, backendTokenAccount);
        backendBalance = Number(account.amount) / Math.pow(10, tokenDecimals);
      } catch (error) {
        throw new Error('Backend token account not found or has no balance');
      }

      const totalNeeded = burnAmount + treasuryAmount;
      if (backendBalance < totalNeeded) {
        throw new Error(`Insufficient balance. Need: ${totalNeeded}, Have: ${backendBalance}`);
      }

      const transaction = new Transaction();

      // Convert amounts to token units using the decimals we fetched
      const burnAmountLamports = BigInt(Math.floor(burnAmount * Math.pow(10, tokenDecimals)));
      const treasuryAmountLamports = BigInt(Math.floor(treasuryAmount * Math.pow(10, tokenDecimals)));

      // Add burn instruction (50% of tokens)
      if (burnAmount > 0) {
        transaction.add(
          createBurnCheckedInstruction(
            backendTokenAccount,
            mintPublicKey,
            backendPublicKey,
            burnAmountLamports,
            tokenDecimals
          )
        );
      }

      // Add transfer instruction to treasury (50% of tokens)
      if (treasuryAmount > 0) {
        transaction.add(
          createTransferCheckedInstruction(
            backendTokenAccount,
            mintPublicKey,
            treasuryTokenAccount,
            backendPublicKey,
            treasuryAmountLamports,
            tokenDecimals
          )
        );
      }

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = backendPublicKey;

      // Sign and send transaction
      console.log(`Executing settlement: Burn ${burnAmount}, Treasury ${treasuryAmount}`);
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [this.backendWallet],
        {
          commitment: 'confirmed',
          maxRetries: 3,
        }
      );

      console.log(`Settlement transaction confirmed: ${signature}`);
      return signature;
    } catch (error: any) {
      console.error('Settlement transaction failed:', error);
      throw new Error(`Settlement failed: ${error.message}`);
    }
  }

  /**
   * Get settlement statistics
   */
  public async getSettlementStats(): Promise<{
    totalBurned: number;
    totalToTreasury: number;
    pendingSettlement: number;
  }> {
    const unsettled = await balanceTracker.getUnsettledRecords(1000);
    const pendingSettlement = unsettled.reduce(
      (sum, record) => sum + record.tokensBurned,
      0
    );

    const stats = await balanceTracker.getTotalStats();
    const totalBurned = stats.totalConsumed / 2; // 50% burned
    const totalToTreasury = stats.totalConsumed / 2; // 50% to treasury

    return {
      totalBurned,
      totalToTreasury,
      pendingSettlement,
    };
  }

  /**
   * Manual settlement trigger (for testing or emergency)
   */
  public async triggerManualSettlement(): Promise<void> {
    console.log(' Manual settlement triggered');
    await this.executeBatchSettlement();
  }

  /**
   * Execute settlement if threshold is reached
   */
  public async checkAndSettleIfNeeded(threshold: number): Promise<boolean> {
    const unsettledRecords = await balanceTracker.getUnsettledRecords(1000);
    const pendingAmount = unsettledRecords.reduce(
      (sum, record) => sum + record.tokensBurned,
      0
    );

    if (pendingAmount >= threshold) {
      await this.executeBatchSettlement();
      return true;
    }
    return false;
  }
}

// Singleton instance
export const settlementService = new SettlementService();
export default settlementService;
