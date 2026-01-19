import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    email?: string;
    walletAddress?: string; // For crypto wallet integration later
    balance: number; // In internal tokens or USD cents
    isPro: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema: Schema = new Schema({
    email: { type: String, unique: true, sparse: true },
    walletAddress: { type: String, unique: true, sparse: true },
    balance: { type: Number, default: 0 },
    isPro: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
