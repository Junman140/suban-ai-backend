import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { solanaConnection } from './connection.service';

/**
 * Transaction Verifier Service
 * Verifies Solana transactions to prevent fake deposits
 */
class TransactionVerifierService {
    /**
     * Verify a transaction hash and validate it's a legitimate token deposit
     */
    async verifyDepositTransaction(
        txHash: string,
        expectedRecipient: string,
        expectedAmount?: number,
        expectedTokenMint?: string
    ): Promise<{
        isValid: boolean;
        actualAmount?: number;
        error?: string;
    }> {
        try {
            const connection = solanaConnection.getConnection();
            const signature = txHash;

            // Fetch transaction from blockchain
            const transaction = await connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed',
            });

            if (!transaction) {
                return {
                    isValid: false,
                    error: 'Transaction not found on blockchain',
                };
            }

            // Check transaction is confirmed
            if (transaction.meta?.err) {
                return {
                    isValid: false,
                    error: `Transaction failed: ${JSON.stringify(transaction.meta.err)}`,
                };
            }

            // Validate recipient address received tokens
            const recipientPubkey = new PublicKey(expectedRecipient);
            let tokenTransferFound = false;
            let actualAmount = 0;
            let tokenMint: string | null = null;

            // Parse transaction instructions to find token transfers
            if (transaction.transaction.message.instructions) {
                for (const instruction of transaction.transaction.message.instructions) {
                    if ('programId' in instruction) {
                        const programId = instruction.programId.toString();

                        // Check if it's a token program instruction
                        if (programId === TOKEN_PROGRAM_ID.toString()) {
                            // Parse token transfer
                            if ('parsed' in instruction && instruction.parsed) {
                                const parsed = instruction.parsed;
                                
                                // Check for token transfer
                                if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
                                    const destination = parsed.info.destination || parsed.info.to;
                                    
                                    if (destination === recipientPubkey.toString()) {
                                        tokenTransferFound = true;
                                        actualAmount = parsed.info.amount || parsed.info.tokenAmount?.amount || 0;
                                        
                                        // Convert amount (tokens have decimals)
                                        const decimals = parsed.info.tokenAmount?.decimals || 9;
                                        actualAmount = actualAmount / Math.pow(10, decimals);
                                        
                                        tokenMint = parsed.info.mint || parsed.info.mintAccount || null;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Also check post-token-balances for confirmation
            if (!tokenTransferFound && transaction.meta?.postTokenBalances) {
                for (const balance of transaction.meta.postTokenBalances) {
                    if (balance.owner === expectedRecipient) {
                        tokenTransferFound = true;
                        const preBalance = transaction.meta.preTokenBalances?.find(
                            b => b.accountIndex === balance.accountIndex
                        )?.uiTokenAmount.uiAmount || 0;
                        const postBalance = balance.uiTokenAmount.uiAmount || 0;
                        actualAmount = postBalance - preBalance;
                        tokenMint = balance.mint || null;
                        break;
                    }
                }
            }

            if (!tokenTransferFound) {
                return {
                    isValid: false,
                    error: 'No token transfer found to recipient address in this transaction',
                };
            }

            // Verify token mint matches (if provided)
            if (expectedTokenMint && tokenMint !== expectedTokenMint) {
                return {
                    isValid: false,
                    error: `Token mint mismatch. Expected: ${expectedTokenMint}, Got: ${tokenMint}`,
                };
            }

            // Verify amount matches (if provided, with small tolerance for fees)
            if (expectedAmount !== undefined) {
                const tolerance = 0.0001; // Small tolerance for rounding
                if (Math.abs(actualAmount - expectedAmount) > tolerance) {
                    return {
                        isValid: false,
                        error: `Amount mismatch. Expected: ${expectedAmount}, Got: ${actualAmount}`,
                    };
                }
            }

            // Verify transaction is not a duplicate (check if already processed)
            // This should be checked in the route handler using a database query

            return {
                isValid: true,
                actualAmount,
            };
        } catch (error: any) {
            console.error('Transaction verification error:', error);
            return {
                isValid: false,
                error: `Verification failed: ${error.message}`,
            };
        }
    }

    /**
     * Check if transaction has been processed before (deduplication)
     * This should be checked against the database
     */
    async isTransactionDuplicate(txHash: string): Promise<boolean> {
        // This will be implemented using database query in the route handler
        // Returning false for now - actual check happens in token.routes.ts
        return false;
    }

    /**
     * Get transaction details from blockchain
     */
    async getTransactionDetails(txHash: string): Promise<ParsedTransactionWithMeta | null> {
        try {
            const connection = solanaConnection.getConnection();
            const transaction = await connection.getParsedTransaction(txHash, {
                maxSupportedTransactionVersion: 0,
                commitment: 'confirmed',
            });
            return transaction;
        } catch (error) {
            console.error('Error fetching transaction:', error);
            return null;
        }
    }
}

export const transactionVerifier = new TransactionVerifierService();
export default transactionVerifier;

