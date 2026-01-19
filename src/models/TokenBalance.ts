import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction {
  type: 'deposit' | 'usage' | 'settlement';
  amount: number;
  txHash?: string;
  timestamp: Date;
  metadata?: any;
}

export interface ITokenBalance extends Document {
  walletAddress: string;
  depositedAmount: number;
  consumedAmount: number;
  currentBalance: number;
  lastUpdated: Date;
  transactions: ITransaction[];
}

const TransactionSchema = new Schema({
  type: {
    type: String,
    enum: ['deposit', 'usage', 'settlement'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  txHash: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  metadata: {
    type: Schema.Types.Mixed,
  },
});

const TokenBalanceSchema = new Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  depositedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  consumedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  currentBalance: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  transactions: [TransactionSchema],
});

// Update lastUpdated on save
TokenBalanceSchema.pre('save', function (next) {
  this.lastUpdated = new Date();
  next();
});

export const TokenBalance = mongoose.model<ITokenBalance>('TokenBalance', TokenBalanceSchema);
