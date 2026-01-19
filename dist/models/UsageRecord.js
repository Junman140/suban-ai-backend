"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageRecord = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const UsageRecordSchema = new mongoose_1.Schema({
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
exports.UsageRecord = mongoose_1.default.model('UsageRecord', UsageRecordSchema);
