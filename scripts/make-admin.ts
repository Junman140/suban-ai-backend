/**
 * Script to mark users as admin in MongoDB
 * Usage: pnpm ts-node scripts/make-admin.ts <walletAddress1> <walletAddress2> ...
 * 
 * Example:
 * pnpm ts-node scripts/make-admin.ts 22hrGCE1Q2khNo8G2B2hhfnaAxZiwf6AVtoDnRVD2sv8
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/user.model';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/suban_ai';

async function makeAdmin() {
    try {
        // Get wallet addresses from command line arguments
        const walletAddresses = process.argv.slice(2);

        if (walletAddresses.length === 0) {
            console.error('Error: Please provide at least one wallet address');
            console.log('Usage: pnpm ts-node scripts/make-admin.ts <walletAddress1> <walletAddress2> ...');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        // Use same connection options as server.ts
        const mongooseOptions = {
            serverSelectionTimeoutMS: 30000, // 30 seconds timeout for server selection
            socketTimeoutMS: 45000, // 45 seconds timeout for socket operations
            connectTimeoutMS: 30000, // 30 seconds timeout for initial connection
            retryWrites: true, // Enable retryable writes
            retryReads: true, // Enable retryable reads
            directConnection: false, // Allow SRV connection (required for Atlas)
        };
        
        await mongoose.connect(MONGODB_URI, mongooseOptions);
        console.log('✅ Connected to MongoDB');

        // Process each wallet address
        for (const walletAddress of walletAddresses) {
            try {
                // Validate wallet address format
                if (walletAddress.length < 32 || walletAddress.length > 44) {
                    console.warn(`⚠️  Invalid wallet address format: ${walletAddress}`);
                    continue;
                }

                // Find or create user
                let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

                if (!user) {
                    // Create new user with admin status
                    user = new User({
                        walletAddress: walletAddress.toLowerCase(),
                        balance: 0,
                        isPro: false,
                        isAdmin: true,
                    });
                    await user.save();
                    console.log(`✅ Created new admin user: ${walletAddress}`);
                } else {
                    // Update existing user to admin
                    if (user.isAdmin) {
                        console.log(`ℹ️  User already admin: ${walletAddress}`);
                    } else {
                        user.isAdmin = true;
                        await user.save();
                        console.log(`✅ Updated user to admin: ${walletAddress}`);
                    }
                }
            } catch (error: any) {
                console.error(`❌ Error processing ${walletAddress}:`, error.message);
            }
        }

        console.log('\n✅ Admin update complete!');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.message?.includes('ECONNREFUSED')) {
            console.error('\n⚠️  MongoDB connection failed. Please check:');
            console.error('   1. MONGODB_URI in your .env file');
            console.error('   2. MongoDB is running and accessible');
            console.error('   3. Network connectivity to MongoDB');
        }
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
    }
}

// Run the script
makeAdmin();
