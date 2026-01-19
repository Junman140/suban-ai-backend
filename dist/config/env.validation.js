"use strict";
/**
 * Environment Variable Validation
 * Validates all required environment variables at startup
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.envValidator = exports.EnvValidator = void 0;
class EnvValidator {
    constructor() {
        this.config = {
            required: {},
            optional: {},
            errors: [],
            warnings: [],
        };
    }
    /**
     * Validate all environment variables
     */
    validate() {
        this.config.errors = [];
        this.config.warnings = [];
        // Required variables
        this.validateRequired('TOKEN_MINT_ADDRESS', 'Solana token mint address');
        this.validateRequired('TREASURY_WALLET_ADDRESS', 'Treasury wallet address for settlement');
        this.validateRequired('MONGODB_URI', 'MongoDB connection string');
        // LLM API Keys (at least one required)
        const llmKeys = [
            process.env.OPENAI_API_KEY,
            process.env.CLAUDE_API_KEY,
            process.env.GROK_API_KEY,
            process.env.DEEPSEEK_API_KEY,
        ];
        if (!llmKeys.some(key => key)) {
            this.config.errors.push('At least one LLM API key is required (OPENAI_API_KEY, CLAUDE_API_KEY, GROK_API_KEY, or DEEPSEEK_API_KEY)');
        }
        // Optional but recommended
        this.validateOptional('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com', 'Solana RPC endpoint');
        this.validateOptional('JUPITER_API_URL', 'https://price.jup.ag/v4', 'Jupiter price API endpoint');
        this.validateOptional('JUPITER_API_KEY', null, 'Jupiter API key (required for Ultra API endpoint)');
        this.validateOptional('BACKEND_WALLET_PRIVATE_KEY', null, 'Backend wallet private key for settlement (BASE58 encoded)');
        this.validateOptional('ADMIN_WALLET_ADDRESSES', null, 'Comma-separated list of admin wallet addresses');
        this.validateOptional('ELEVENLABS_API_KEY', null, 'ElevenLabs API key for TTS (voice features will be disabled if missing)');
        this.validateOptional('ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM', 'ElevenLabs voice ID');
        this.validateOptional('PORT', '5000', 'Server port');
        this.validateOptional('NODE_ENV', 'development', 'Node environment (development/production)');
        // Cost configuration (optional, have defaults)
        this.validateOptional('DEFAULT_CHAT_COST_USD', '0.02', 'Default chat cost in USD');
        this.validateOptional('DEFAULT_VOICE_COST_USD', '0.05', 'Default voice cost in USD');
        this.validateOptional('STT_COST_USD', '0.01', 'Speech-to-text cost in USD');
        // Settlement configuration
        this.validateOptional('SETTLEMENT_PROGRAM_ID', null, 'Solana settlement program ID (optional)');
        this.validateOptional('SETTLEMENT_INTERVAL_MINUTES', '60', 'Settlement batch interval in minutes');
        this.validateOptional('SETTLEMENT_THRESHOLD_TOKENS', '1000', 'Minimum tokens to trigger settlement');
        // TWAP and burn configuration
        this.validateOptional('TWAP_WINDOW_MINUTES', '10', 'TWAP calculation window in minutes');
        this.validateOptional('BURN_FLOOR', '0.05', 'Minimum token burn amount');
        this.validateOptional('BURN_CEILING', '50', 'Maximum token burn amount');
        // Warning for missing optional but important variables
        if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
            this.config.warnings.push('BACKEND_WALLET_PRIVATE_KEY not set. Settlement functionality will not work.');
        }
        if (!process.env.ADMIN_WALLET_ADDRESSES) {
            this.config.warnings.push('ADMIN_WALLET_ADDRESSES not set. Admin endpoints are unprotected.');
        }
        if (!process.env.ELEVENLABS_API_KEY) {
            this.config.warnings.push('ELEVENLABS_API_KEY not set. Text-to-speech features will be disabled.');
        }
        if (!process.env.SOLANA_RPC_URL) {
            this.config.warnings.push('SOLANA_RPC_URL not set. Using public RPC (rate limited).');
        }
        return {
            isValid: this.config.errors.length === 0,
            errors: this.config.errors,
            warnings: this.config.warnings,
        };
    }
    validateRequired(key, description) {
        if (!process.env[key] || process.env[key].trim() === '') {
            this.config.errors.push(`Missing required environment variable: ${key} (${description})`);
        }
    }
    validateOptional(key, defaultValue, description) {
        this.config.optional[key] = {
            default: defaultValue,
            description,
        };
        // Set default value if not provided
        if (!process.env[key] && defaultValue !== null) {
            process.env[key] = String(defaultValue);
        }
    }
    /**
     * Get validation report as formatted string
     */
    getReport() {
        const result = this.validate();
        let report = '\n=== Environment Variable Validation ===\n\n';
        if (result.errors.length > 0) {
            report += '❌ ERRORS (Required variables missing):\n';
            result.errors.forEach(error => {
                report += `   - ${error}\n`;
            });
            report += '\n';
        }
        if (result.warnings.length > 0) {
            report += '⚠️  WARNINGS (Optional but recommended):\n';
            result.warnings.forEach(warning => {
                report += `   - ${warning}\n`;
            });
            report += '\n';
        }
        if (result.isValid) {
            report += '✅ All required environment variables are set.\n';
        }
        report += '\n';
        return report;
    }
    /**
     * Get all optional variables with defaults
     */
    getOptionalVars() {
        return this.config.optional;
    }
}
exports.EnvValidator = EnvValidator;
// Singleton instance
exports.envValidator = new EnvValidator();
// Validate on module load (will run when imported)
if (require.main === module) {
    // Only validate if running directly (not when imported)
    const result = exports.envValidator.validate();
    console.log(exports.envValidator.getReport());
    if (!result.isValid) {
        console.error('❌ Environment validation failed. Please fix the errors above.');
        process.exit(1);
    }
}
