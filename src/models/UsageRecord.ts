import mongoose, { Schema, Document } from 'mongoose';

export interface IUsageRecord extends Document {
  walletAddress: string;
  requestType: 'chat' | 'voice';
  usdCost: number;
  tokenPrice: number;
  tokensBurned: number;
  timestamp: Date;
  settled: boolean;
  txHash?: string;
  metadata?: {
    requestId?: string;
    duration?: number;
    model?: string;
  };
}

const UsageRecordSchema = new Schema({
  walletAddress: {
    type: String,
    required: true,
    index: true,
  },
  requestType: {
    type: String,
    enum: ['chat', 'voice'],
    required: true,
  },
  usdCost: {
    type: Number,
    required: true,
    min: 0,
  },
  tokenPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  tokensBurned: {
    type: Number,
    required: true,
    min: 0,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  settled: {
    type: Boolean,
    default: false,
    index: true,
  },
  txHash: {
    type: String,
  },
  metadata: {
    requestId: String,
    duration: Number,
    model: String,
  },
});

// Compound index for efficient queries
UsageRecordSchema.index({ walletAddress: 1, timestamp: -1 });
UsageRecordSchema.index({ settled: 1, timestamp: 1 });

export const UsageRecord = mongoose.model<IUsageRecord>('UsageRecord', UsageRecordSchema);
