import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse } from 'url';
import logger, { requestLoggerMiddleware, errorLoggerMiddleware } from './utils/logger';
import voiceService from './services/voice.service';

// Load environment variables
dotenv.config();

// Validate environment variables
import { envValidator } from './config/env.validation';
const envValidation = envValidator.validate();

if (!envValidation.isValid) {
    console.error(envValidator.getReport());
    console.error(' Environment validation failed. Server will not start.');
    process.exit(1);
}

// Log warnings if any
if (envValidation.warnings.length > 0) {
    console.warn(envValidator.getReport());
}

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;

// WebSocket Server for Voice Sessions
const wss = new WebSocketServer({ 
    server,
    noServer: false,
    verifyClient: (info, callback) => {
        // Allow all WebSocket connections - path validation happens in connection handler
        const url = parse(info.req.url || '', true);
        logger.info('WebSocket verification', { pathname: url.pathname, url: info.req.url });
        
        // Accept all WebSocket connections - we'll validate the path inside the handler
        callback(true);
    }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting (apply globally)
import { generalRateLimiter } from './middleware/rateLimit.middleware';
app.use('/api', generalRateLimiter);

// Structured logging middleware (before routes)
app.use(requestLoggerMiddleware);

// Optional: Use morgan for HTTP request logging (can be disabled if using structured logger)
if (process.env.USE_MORGAN !== 'false') {
    app.use(morgan('dev'));
}

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/suban_ai';

// MongoDB connection options for Atlas
const mongooseOptions = {
    serverSelectionTimeoutMS: 30000, // 30 seconds timeout for server selection
    socketTimeoutMS: 45000, // 45 seconds timeout for socket operations
    connectTimeoutMS: 30000, // 30 seconds timeout for initial connection
    retryWrites: true, // Enable retryable writes
    retryReads: true, // Enable retryable reads
    directConnection: false, // Allow SRV connection (required for Atlas)
};

// MongoDB connection event handlers for better debugging
mongoose.connection.on('connected', () => {
    logger.info('MongoDB Connected', { uri: MONGODB_URI.replace(/\/\/.*@/, '//***@') });
});

mongoose.connection.on('error', (err) => {
    logger.error('MongoDB Connection Error', { 
        error: err.message,
        stack: err.stack 
    });
});

mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB Disconnected');
});

mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB Reconnected');
});

// Handle process termination
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed due to application termination');
    process.exit(0);
});

mongoose.connect(MONGODB_URI, mongooseOptions)
    .catch((err) => {
        logger.error('MongoDB Initial Connection Error', { 
            error: err.message,
            stack: err.stack,
            note: 'Connection will retry automatically. If this persists, check your MONGODB_URI and network connectivity.'
        });
        // Don't exit the process - allow server to continue (might be network issue)
    });

// Routes (Placeholders)
app.get('/', (req, res) => {
    res.send('AI Suban API is running');
});

// Import Routes
import authRoutes from './api/auth.routes';
import chatRoutes from './api/chat.routes';
import voiceRoutes from './api/voice.routes';
import tokenRoutes from './api/token.routes';

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/token', tokenRoutes);

// Initialize Solana services
import priceOracle from './services/solana/price-oracle.service';
import solanaConnection from './services/solana/connection.service';

async function initializeSolanaServices() {
    try {
        logger.info('Initializing Solana services...');
        
        // Test connection
        const isHealthy = await solanaConnection.testConnection();
        if (!isHealthy) {
            logger.warn('Solana connection unhealthy, but continuing...');
        }

        // Start health monitoring (check every 60 seconds)
        solanaConnection.startHealthMonitoring(60000);

        // Initialize price oracle
        await priceOracle.initialize();
        
        // Set up periodic price updates (every 2 minutes)
        setInterval(async () => {
            try {
                await priceOracle.fetchCurrentPrice();
            } catch (error: any) {
                logger.error('Failed to update price', { error: error.message });
            }
        }, 2 * 60 * 1000);

        // Initialize automated settlement
        await initializeAutomatedSettlement();

        logger.info('Solana services initialized successfully');
    } catch (error: any) {
        logger.error('Failed to initialize Solana services', { error: error.message });
    }
}

async function initializeAutomatedSettlement() {
    try {
        const settlementService = (await import('./services/solana/settlement.service')).settlementService;
        
        const intervalMinutes = parseInt(process.env.SETTLEMENT_INTERVAL_MINUTES || '60');
        const thresholdTokens = parseFloat(process.env.SETTLEMENT_THRESHOLD_TOKENS || '1000');

        logger.info('Initializing automated settlement', {
            intervalMinutes,
            thresholdTokens,
        });

        // Check for threshold-based settlement every 5 minutes
        setInterval(async () => {
            try {
                const { balanceTracker } = await import('./services/solana/balance-tracker.service');
                const unsettledRecords = await balanceTracker.getUnsettledRecords(1000);
                const pendingAmount = unsettledRecords.reduce(
                    (sum, record) => sum + record.tokensBurned,
                    0
                );

                if (pendingAmount >= thresholdTokens) {
                    logger.info('Settlement threshold reached, triggering settlement', {
                        pendingAmount,
                        thresholdTokens,
                    });
                    await settlementService.triggerManualSettlement();
                }
            } catch (error: any) {
                logger.error('Automated settlement check failed', { error: error.message });
            }
        }, 5 * 60 * 1000); // Check every 5 minutes

        // Scheduled settlement at regular intervals
        setInterval(async () => {
            try {
                logger.info('Scheduled settlement triggered');
                await settlementService.executeBatchSettlement();
            } catch (error: any) {
                logger.error('Scheduled settlement failed', { error: error.message });
            }
        }, intervalMinutes * 60 * 1000);

        logger.info('Automated settlement initialized');
    } catch (error: any) {
        logger.error('Failed to initialize automated settlement', { error: error.message });
    }
}

// Error handling middleware (must be last)
app.use(errorLoggerMiddleware);

// WebSocket handler for voice sessions
wss.on('connection', (ws: WebSocket, req) => {
    const url = parse(req.url || '', true);
    logger.info('WebSocket connection attempt', { pathname: url.pathname, url: req.url });
    
    // Validate path starts with /api/voice/ws/
    if (!url.pathname?.startsWith('/api/voice/ws/')) {
        logger.warn('WebSocket connection rejected - invalid path', { path: url.pathname });
        ws.close(1008, 'Invalid path');
        return;
    }
    
    // Extract sessionId from path like /api/voice/ws/:sessionId
    const pathParts = url.pathname?.split('/').filter(p => p);
    const sessionIdIndex = pathParts?.indexOf('ws');
    const sessionId = sessionIdIndex !== undefined && sessionIdIndex >= 0 && pathParts 
        ? pathParts[sessionIdIndex + 1] 
        : null;

    if (!sessionId) {
        logger.warn('WebSocket connection without sessionId', { path: url.pathname });
        ws.close(1008, 'Session ID required');
        return;
    }

    logger.info('WebSocket connection established', { sessionId });

    // Get the Grok Voice session
    const session = voiceService.getSession(sessionId);
    if (!session) {
        logger.warn('WebSocket connection for non-existent session', { sessionId });
        ws.close(1008, 'Session not found');
        return;
    }

    // Forward messages from Grok Voice Agent to client
    const onAudio = (audioBuffer: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'audio',
                data: audioBuffer.toString('base64'),
            }));
        }
    };

    const onTranscript = (text: string) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'transcript',
                text,
            }));
        }
    };

    const onTranscriptDone = () => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'transcript_done',
            }));
        }
    };

    const onUserTranscript = (text: string) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'user_transcript',
                text,
            }));
        }
    };

    const onSpeechStarted = () => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'speech_started',
            }));
        }
    };

    const onSpeechStopped = () => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'speech_stopped',
            }));
        }
    };

    const onResponseCreated = () => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'response_created',
            }));
        }
    };

    const onResponseDone = () => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'response_done',
            }));
        }
    };

    const onError = (error: Error) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'error',
                message: error.message || 'An error occurred',
            }));
        }
    };

    // Register event listeners
    session.on('audio', onAudio);
    session.on('transcript', onTranscript);
    session.on('transcript_done', onTranscriptDone);
    session.on('user_transcript', onUserTranscript);
    session.on('speech_started', onSpeechStarted);
    session.on('speech_stopped', onSpeechStopped);
    session.on('response_created', onResponseCreated);
    session.on('response_done', onResponseDone);
    session.on('error', (error: Error) => {
        logger.error('Grok Voice session error', { error: error.message, sessionId });
        onError(error);
    });
    session.on('close', () => {
        logger.warn('Grok Voice session closed', { sessionId });
        // Close client WebSocket if Grok session closes
        if (ws.readyState === WebSocket.OPEN) {
            ws.close(1000, 'Grok session closed');
        }
    });
    session.on('error', (error: Error) => {
        logger.error('Grok Voice session error in handler', { error: error.message, sessionId });
        // Forward error to client
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'error',
                message: error.message || 'Grok session error',
            }));
        }
    });
    session.on('connected', () => {
        logger.info('Grok Voice session connected', { sessionId });
    });

    // Send initial connection confirmation to client
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'connected',
            sessionId,
        }));
    }

    // Handle messages from client
    ws.on('message', (message: Buffer) => {
        try {
            // Check if session is still valid and connected
            const currentSession = voiceService.getSession(sessionId);
            if (!currentSession || !currentSession.isConnected) {
                logger.warn('Received message for disconnected session', { sessionId });
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Session disconnected',
                    }));
                    ws.close(1008, 'Session disconnected');
                }
                return;
            }

            const messageStr = message.toString();
            let data: any;
            
            try {
                data = JSON.parse(messageStr);
            } catch (parseError: any) {
                logger.error('Failed to parse WebSocket message as JSON', { 
                    error: parseError.message,
                    messagePreview: messageStr.substring(0, 100),
                    sessionId 
                });
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format',
                }));
                return;
            }
            
            // Debug: log all message types to see what we're receiving
            if (!(ws as any)._messageLogCount) {
                (ws as any)._messageLogCount = 0;
            }
            if ((ws as any)._messageLogCount < 5) {
                logger.info('📨 Received WebSocket message from client', { 
                    sessionId,
                    type: data.type,
                    hasData: !!data.data,
                    dataLength: data.data?.length,
                    count: (ws as any)._messageLogCount + 1
                });
                (ws as any)._messageLogCount++;
            }

            if (data.type === 'audio' && data.data) {
                try {
                    // Send audio to Grok Voice Agent
                    const audioBuffer = Buffer.from(data.data, 'base64');
                    // Debug: log first few audio messages to verify streaming
                    if (!(ws as any)._audioLogCount) {
                        (ws as any)._audioLogCount = 0;
                    }
                    if ((ws as any)._audioLogCount < 5) {
                        logger.info('📤 Forwarding audio to Grok', { 
                            sessionId, 
                            audioSize: audioBuffer.length,
                            base64Length: data.data.length,
                            count: (ws as any)._audioLogCount + 1
                        });
                        (ws as any)._audioLogCount++;
                    }
                    session.sendAudio(audioBuffer);
                } catch (audioError: any) {
                    logger.error('Error sending audio to Grok', { 
                        error: audioError.message,
                        stack: audioError.stack,
                        sessionId 
                    });
                    // Don't send error to client for audio failures - just log
                    // Audio failures are usually transient
                }
            } else if (data.type === 'text' && data.text) {
                try {
                    // Send text to Grok Voice Agent
                    session.sendText(data.text);
                } catch (textError: any) {
                    logger.error('Error sending text to Grok', { 
                        error: textError.message,
                        sessionId 
                    });
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Failed to send text message',
                    }));
                }
            } else if (data.type === 'input_audio_buffer.commit') {
                // With server_vad, commit is automatic - log if client sends it manually
                logger.warn('⚠️ Client sent manual commit (server_vad handles this automatically)', { sessionId });
                // Don't forward manual commits with server_vad - let the server handle it
                // session.commitAudioBuffer();
            } else {
                // Unknown message type - log but don't error
                logger.debug('Unknown WebSocket message type', { type: data.type, sessionId });
            }
        } catch (error: any) {
            logger.error('WebSocket message processing error', { 
                error: error.message,
                stack: error.stack,
                sessionId 
            });
            // Only send error if WebSocket is still open
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Failed to process message',
                    }));
                } catch (sendError: any) {
                    logger.error('Failed to send error message to client', { 
                        error: sendError.message,
                        sessionId 
                    });
                }
            }
        }
    });

    // Handle WebSocket close
    ws.on('close', () => {
        logger.info('WebSocket connection closed', { sessionId });
        // Remove event listeners
        session.removeListener('audio', onAudio);
        session.removeListener('transcript', onTranscript);
        session.removeListener('transcript_done', onTranscriptDone);
        session.removeListener('user_transcript', onUserTranscript);
        session.removeListener('speech_started', onSpeechStarted);
        session.removeListener('speech_stopped', onSpeechStopped);
        session.removeListener('response_created', onResponseCreated);
        session.removeListener('response_done', onResponseDone);
        session.removeListener('error', onError);
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message, sessionId });
    });
});

// Start Server
server.listen(PORT, async () => {
    logger.info(`Server started`, { port: PORT, env: process.env.NODE_ENV || 'development' });
    console.log(`🚀 Server running on port ${PORT}`);
    await initializeSolanaServices();
});

