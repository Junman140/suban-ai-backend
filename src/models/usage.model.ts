import mongoose, { Schema, Document } from 'mongoose';

export interface IUsage extends Document {
    userId: mongoose.Types.ObjectId;
    sessionId: string;
    type: 'chat' | 'voice';
    inputTokens: number;
    outputTokens: number;
    whisperDuration: number; // Seconds
    ttsCharacters: number;
    costUSD: number;
    createdAt: Date;
}

const UsageSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true },
    type: { type: String, enum: ['chat', 'voice'], required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    whisperDuration: { type: Number, default: 0 }, // Seconds
    ttsCharacters: { type: Number, default: 0 },
    costUSD: { type: Number, required: true }, // Internal cost tracking
}, { timestamps: true });

export default mongoose.model<IUsage>('Usage', UsageSchema);
