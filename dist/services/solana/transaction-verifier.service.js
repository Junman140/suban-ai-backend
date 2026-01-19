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
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionVerifier = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const connection_service_1 = require("./connection.service");
/**
 * Transaction Verifier Service
 * Verifies Solana transactions to prevent fake deposits
 */
class TransactionVerifierService {
    /**
     * Verify a transaction hash and validate it's a legitimate token deposit
     */
    verifyDepositTransaction(txHash, expectedRecipient, expectedAmount, expectedTokenMint) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                const connection = connection_service_1.solanaConnection.getConnection();
                const signature = txHash;
                // Fetch transaction from blockchain
                const transaction = yield connection.getParsedTransaction(signature, {
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
                if ((_a = transaction.meta) === null || _a === void 0 ? void 0 : _a.err) {
                    return {
                        isValid: false,
                        error: `Transaction failed: ${JSON.stringify(transaction.meta.err)}`,
                    };
                }
                // Validate recipient address received tokens
                const recipientPubkey = new web3_js_1.PublicKey(expectedRecipient);
                let tokenTransferFound = false;
                let actualAmount = 0;
                let tokenMint = null;
                // Parse transaction instructions to find token transfers
                if (transaction.transaction.message.instructions) {
                    for (const instruction of transaction.transaction.message.instructions) {
                        if ('programId' in instruction) {
                            const programId = instruction.programId.toString();
                            // Check if it's a token program instruction
                            if (programId === spl_token_1.TOKEN_PROGRAM_ID.toString()) {
                                // Parse token transfer
                                if ('parsed' in instruction && instruction.parsed) {
                                    const parsed = instruction.parsed;
                                    // Check for token transfer
                                    if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
                                        const destination = parsed.info.destination || parsed.info.to;
                                        if (destination === recipientPubkey.toString()) {
                                            tokenTransferFound = true;
                                            actualAmount = parsed.info.amount || ((_b = parsed.info.tokenAmount) === null || _b === void 0 ? void 0 : _b.amount) || 0;
                                            // Convert amount (tokens have decimals)
                                            const decimals = ((_c = parsed.info.tokenAmount) === null || _c === void 0 ? void 0 : _c.decimals) || 9;
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
                if (!tokenTransferFound && ((_d = transaction.meta) === null || _d === void 0 ? void 0 : _d.postTokenBalances)) {
                    for (const balance of transaction.meta.postTokenBalances) {
                        if (balance.owner === expectedRecipient) {
                            tokenTransferFound = true;
                            const preBalance = ((_f = (_e = transaction.meta.preTokenBalances) === null || _e === void 0 ? void 0 : _e.find(b => b.accountIndex === balance.accountIndex)) === null || _f === void 0 ? void 0 : _f.uiTokenAmount.uiAmount) || 0;
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
            }
            catch (error) {
                console.error('Transaction verification error:', error);
                return {
                    isValid: false,
                    error: `Verification failed: ${error.message}`,
                };
            }
        });
    }
    /**
     * Check if transaction has been processed before (deduplication)
     * This should be checked against the database
     */
    isTransactionDuplicate(txHash) {
        return __awaiter(this, void 0, void 0, function* () {
            // This will be implemented using database query in the route handler
            // Returning false for now - actual check happens in token.routes.ts
            return false;
        });
    }
    /**
     * Get transaction details from blockchain
     */
    getTransactionDetails(txHash) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const connection = connection_service_1.solanaConnection.getConnection();
                const transaction = yield connection.getParsedTransaction(txHash, {
                    maxSupportedTransactionVersion: 0,
                    commitment: 'confirmed',
                });
                return transaction;
            }
            catch (error) {
                console.error('Error fetching transaction:', error);
                return null;
            }
        });
    }
}
exports.transactionVerifier = new TransactionVerifierService();
exports.default = exports.transactionVerifier;
