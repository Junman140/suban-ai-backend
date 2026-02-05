/**
 * Environment Variable Validation
 * Validates all required environment variables at startup
 */

interface EnvConfig {
    required: Record<string, string>;
    optional: Record<string, { default: any; description: string }>;
    errors: string[];
    warnings: string[];
}

export class EnvValidator {
    private config: EnvConfig;

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
    validate(): { isValid: boolean; errors: string[]; warnings: string[] } {
        this.config.errors = [];
        this.config.warnings = [];

        // Required variables
        this.validateRequired('TOKEN_MINT_ADDRESS', 'Solana token mint address');
        this.validateRequired('TREASURY_WALLET_ADDRESS', 'Treasury wallet address for settlement');
        this.validateRequired('MONGODB_URI', 'MongoDB connection string');

        // LLM API Keys (at least one required)
        const llmKeys = [
            process.env.GROK_API_KEY,
            process.env.DEEPSEEK_API_KEY,
        ];
        if (!llmKeys.some(key => key)) {
            this.config.errors.push('At least one LLM API key is required (GROK_API_KEY or DEEPSEEK_API_KEY)');
        }

        // Optional but recommended
        this.validateOptional('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com', 'Solana RPC endpoint');
        this.validateOptional('JUPITER_API_URL', 'https://price.jup.ag/v4', 'Jupiter price API endpoint');
        this.validateOptional('JUPITER_API_KEY', null, 'Jupiter API key (required for Ultra API endpoint)');
        this.validateOptional('BACKEND_WALLET_PRIVATE_KEY', null, 'Backend wallet private key for settlement (BASE58 encoded)');
        this.validateOptional('ADMIN_WALLET_ADDRESSES', null, 'Comma-separated list of admin wallet addresses');
        this.validateOptional('PORT', '5000', 'Server port');
        this.validateOptional('NODE_ENV', 'development', 'Node environment (development/production)');

        // Cost configuration (optional, have defaults)
        this.validateOptional('DEFAULT_CHAT_COST_USD', '0.02', 'Default chat cost in USD');
        this.validateOptional('DEFAULT_VOICE_COST_USD', '0.10', 'Default voice session cost in USD (Grok Voice Agent)');

        // Settlement configuration
        this.validateOptional('SETTLEMENT_PROGRAM_ID', null, 'Solana settlement program ID (optional)');
        this.validateOptional('SETTLEMENT_INTERVAL_MINUTES', '60', 'Settlement batch interval in minutes');
        this.validateOptional('SETTLEMENT_THRESHOLD_TOKENS', '1000', 'Minimum tokens to trigger settlement');

        // TWAP and burn configuration
        this.validateOptional('TWAP_WINDOW_MINUTES', '10', 'TWAP calculation window in minutes');
        this.validateOptional('BURN_FLOOR', '0.05', 'Minimum token burn amount');
        this.validateOptional('BURN_CEILING', '50', 'Maximum token burn amount');

        // Auth configuration
        this.validateOptional('JWT_SECRET', null, 'JWT secret for signing auth tokens (required for persistent login)');

        // Meme Studio (DALL-E)
        this.validateOptional('OPENAI_API_KEY', null, 'OpenAI API key for Meme Studio image generation (DALL-E 3)');

        // Meme Studio Video (LTX Studio)
        this.validateOptional('LTX_API_KEY', null, 'LTX Studio API key for Meme Studio video/GIF generation (LTX-2)');

        // Warning for missing optional but important variables
        if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
            this.config.warnings.push('BACKEND_WALLET_PRIVATE_KEY not set. Settlement functionality will not work.');
        }

        if (!process.env.ADMIN_WALLET_ADDRESSES) {
            this.config.warnings.push('ADMIN_WALLET_ADDRESSES not set. Admin endpoints are unprotected.');
        }

        if (!process.env.SOLANA_RPC_URL) {
            this.config.warnings.push('SOLANA_RPC_URL not set. Using public RPC (rate limited).');
        }

        if (!process.env.OPENAI_API_KEY) {
            this.config.warnings.push('OPENAI_API_KEY not set. Meme Studio image generation will return 503 until set.');
        }

        if (!process.env.LTX_API_KEY) {
            this.config.warnings.push('LTX_API_KEY not set. Meme Studio video/GIF generation will return 503 until set.');
        }

        return {
            isValid: this.config.errors.length === 0,
            errors: this.config.errors,
            warnings: this.config.warnings,
        };
    }

    private validateRequired(key: string, description: string): void {
        if (!process.env[key] || process.env[key]!.trim() === '') {
            this.config.errors.push(`Missing required environment variable: ${key} (${description})`);
        }
    }

    private validateOptional(
        key: string,
        defaultValue: any,
        description: string
    ): void {
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
    getReport(): string {
        const result = this.validate();
        let report = '\n=== Environment Variable Validation ===\n\n';

        if (result.errors.length > 0) {
            report += 'ERRORS (Required variables missing):\n';
            result.errors.forEach(error => {
                report += `   - ${error}\n`;
            });
            report += '\n';
        }

        if (result.warnings.length > 0) {
            report += 'WARNINGS (Optional but recommended):\n';
            result.warnings.forEach(warning => {
                report += `   - ${warning}\n`;
            });
            report += '\n';
        }

        if (result.isValid) {
            report += 'All required environment variables are set.\n';
        }

        report += '\n';
        return report;
    }

    /**
     * Get all optional variables with defaults
     */
    getOptionalVars(): Record<string, { default: any; description: string }> {
        return this.config.optional;
    }
}

// Singleton instance
export const envValidator = new EnvValidator();

// Validate on module load (will run when imported)
if (require.main === module) {
    // Only validate if running directly (not when imported)
    const result = envValidator.validate();
    console.log(envValidator.getReport());
    
    if (!result.isValid) {
        console.error('Environment validation failed. Please fix the errors above.');
        process.exit(1);
    }
}

