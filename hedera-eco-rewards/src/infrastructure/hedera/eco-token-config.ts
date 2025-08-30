import { injectable, inject } from 'inversify';
import { TokenConfiguration } from '../../domain/repositories/token-service.interface';
import { HederaAccountId } from '../../domain/value-objects/hedera-account-id';
import { IConfigService } from '../../shared/config/config.interface';
import { TYPES } from '../../shared/container/types';

/**
 * EcoToken Configuration
 * 
 * Provides configuration for the EcoToken used in the rewards system.
 * This includes token metadata, treasury setup, and key management.
 */
@injectable()
export class EcoTokenConfig {
  constructor(
    @inject(TYPES.ConfigService) private configService: IConfigService
  ) {}

  /**
   * Get the default EcoToken configuration
   */
  getTokenConfiguration(): TokenConfiguration {
    const treasuryAccountId = this.configService.get('HEDERA_TREASURY_ACCOUNT_ID') || 
                             this.configService.get('HEDERA_OPERATOR_ACCOUNT_ID');
    const treasuryPrivateKey = this.configService.get('HEDERA_TREASURY_PRIVATE_KEY') || 
                              this.configService.get('HEDERA_OPERATOR_PRIVATE_KEY');

    if (!treasuryAccountId || !treasuryPrivateKey) {
      throw new Error('Treasury account configuration is required for EcoToken creation');
    }

    return {
      name: 'ShebaGreen EcoToken',
      symbol: 'ECO',
      decimals: 2, // 2 decimal places for token amounts
      initialSupply: 0n, // Start with 0 supply, mint as needed
      treasuryAccountId: new HederaAccountId(treasuryAccountId),
      adminKey: treasuryPrivateKey,
      supplyKey: treasuryPrivateKey,
      freezeKey: treasuryPrivateKey, // Optional: allows freezing accounts
      memo: 'EcoToken for ShebaGreen environmental cleanup rewards',
    };
  }

  /**
   * Get the existing EcoToken ID if already created
   */
  getExistingTokenId(): string | null {
    return this.configService.get('HEDERA_TOKEN_ID') || null;
  }

  /**
   * Get treasury account information
   */
  getTreasuryAccount(): { accountId: HederaAccountId; privateKey: string } {
    const treasuryAccountId = this.configService.get('HEDERA_TREASURY_ACCOUNT_ID') || 
                             this.configService.get('HEDERA_OPERATOR_ACCOUNT_ID');
    const treasuryPrivateKey = this.configService.get('HEDERA_TREASURY_PRIVATE_KEY') || 
                              this.configService.get('HEDERA_OPERATOR_PRIVATE_KEY');

    if (!treasuryAccountId || !treasuryPrivateKey) {
      throw new Error('Treasury account configuration is required');
    }

    return {
      accountId: new HederaAccountId(treasuryAccountId),
      privateKey: treasuryPrivateKey,
    };
  }

  /**
   * Validate token configuration
   */
  validateConfiguration(): void {
    const config = this.getTokenConfiguration();
    
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Token name is required');
    }

    if (!config.symbol || config.symbol.trim().length === 0) {
      throw new Error('Token symbol is required');
    }

    if (config.decimals < 0 || config.decimals > 8) {
      throw new Error('Token decimals must be between 0 and 8');
    }

    if (!config.treasuryAccountId) {
      throw new Error('Treasury account ID is required');
    }

    if (!config.adminKey || !config.supplyKey) {
      throw new Error('Admin and supply keys are required');
    }
  }
}