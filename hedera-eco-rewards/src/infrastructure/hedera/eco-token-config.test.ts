import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EcoTokenConfig } from './eco-token-config';
import { IConfigService } from '../../shared/config/config.interface';
import { HederaAccountId } from '../../domain/value-objects/hedera-account-id';

describe('EcoTokenConfig', () => {
  let ecoTokenConfig: EcoTokenConfig;
  let mockConfigService: IConfigService;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          HEDERA_TREASURY_ACCOUNT_ID: '0.0.98765',
          HEDERA_TREASURY_PRIVATE_KEY: 'treasury-private-key',
          HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
          HEDERA_OPERATOR_PRIVATE_KEY: 'operator-private-key',
          HEDERA_TOKEN_ID: '0.0.54321',
        };
        return config[key];
      }),
    } as IConfigService;

    ecoTokenConfig = new EcoTokenConfig(mockConfigService);
  });

  describe('getTokenConfiguration', () => {
    it('should return valid token configuration with treasury account', () => {
      const config = ecoTokenConfig.getTokenConfiguration();

      expect(config.name).toBe('ShebaGreen EcoToken');
      expect(config.symbol).toBe('ECO');
      expect(config.decimals).toBe(2);
      expect(config.initialSupply).toBe(0n);
      expect(config.treasuryAccountId.toString()).toBe('0.0.98765');
      expect(config.adminKey).toBe('treasury-private-key');
      expect(config.supplyKey).toBe('treasury-private-key');
      expect(config.freezeKey).toBe('treasury-private-key');
      expect(config.memo).toBe('EcoToken for ShebaGreen environmental cleanup rewards');
    });

    it('should fallback to operator account when treasury not configured', () => {
      mockConfigService.get = vi.fn((key: string) => {
        const config: Record<string, string> = {
          HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
          HEDERA_OPERATOR_PRIVATE_KEY: 'operator-private-key',
        };
        return config[key];
      });

      ecoTokenConfig = new EcoTokenConfig(mockConfigService);
      const config = ecoTokenConfig.getTokenConfiguration();

      expect(config.treasuryAccountId.toString()).toBe('0.0.12345');
      expect(config.adminKey).toBe('operator-private-key');
      expect(config.supplyKey).toBe('operator-private-key');
    });

    it('should throw error when no treasury or operator account configured', () => {
      mockConfigService.get = vi.fn(() => null);

      ecoTokenConfig = new EcoTokenConfig(mockConfigService);

      expect(() => ecoTokenConfig.getTokenConfiguration()).toThrow(
        'Treasury account configuration is required for EcoToken creation'
      );
    });
  });

  describe('getExistingTokenId', () => {
    it('should return existing token ID when configured', () => {
      const tokenId = ecoTokenConfig.getExistingTokenId();
      expect(tokenId).toBe('0.0.54321');
    });

    it('should return null when no token ID configured', () => {
      mockConfigService.get = vi.fn((key: string) => {
        if (key === 'HEDERA_TOKEN_ID') return null;
        return 'mock-value';
      });

      ecoTokenConfig = new EcoTokenConfig(mockConfigService);
      const tokenId = ecoTokenConfig.getExistingTokenId();
      expect(tokenId).toBeNull();
    });
  });

  describe('getTreasuryAccount', () => {
    it('should return treasury account information', () => {
      const treasury = ecoTokenConfig.getTreasuryAccount();

      expect(treasury.accountId.toString()).toBe('0.0.98765');
      expect(treasury.privateKey).toBe('treasury-private-key');
    });

    it('should fallback to operator account', () => {
      mockConfigService.get = vi.fn((key: string) => {
        const config: Record<string, string> = {
          HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
          HEDERA_OPERATOR_PRIVATE_KEY: 'operator-private-key',
        };
        return config[key];
      });

      ecoTokenConfig = new EcoTokenConfig(mockConfigService);
      const treasury = ecoTokenConfig.getTreasuryAccount();

      expect(treasury.accountId.toString()).toBe('0.0.12345');
      expect(treasury.privateKey).toBe('operator-private-key');
    });

    it('should throw error when no account configured', () => {
      mockConfigService.get = vi.fn(() => null);

      ecoTokenConfig = new EcoTokenConfig(mockConfigService);

      expect(() => ecoTokenConfig.getTreasuryAccount()).toThrow(
        'Treasury account configuration is required'
      );
    });
  });

  describe('validateConfiguration', () => {
    it('should validate valid configuration without errors', () => {
      expect(() => ecoTokenConfig.validateConfiguration()).not.toThrow();
    });

    it('should throw error for empty token name', () => {
      // Mock a configuration that would result in empty name
      const originalGet = mockConfigService.get;
      mockConfigService.get = vi.fn((key: string) => {
        if (key === 'HEDERA_TREASURY_ACCOUNT_ID') return '0.0.98765';
        if (key === 'HEDERA_TREASURY_PRIVATE_KEY') return 'key';
        return originalGet(key);
      });

      // Override the getTokenConfiguration to return invalid name
      const originalMethod = ecoTokenConfig.getTokenConfiguration;
      ecoTokenConfig.getTokenConfiguration = vi.fn(() => ({
        ...originalMethod.call(ecoTokenConfig),
        name: '',
      }));

      expect(() => ecoTokenConfig.validateConfiguration()).toThrow('Token name is required');
    });

    it('should throw error for empty token symbol', () => {
      const originalMethod = ecoTokenConfig.getTokenConfiguration;
      ecoTokenConfig.getTokenConfiguration = vi.fn(() => ({
        ...originalMethod.call(ecoTokenConfig),
        symbol: '',
      }));

      expect(() => ecoTokenConfig.validateConfiguration()).toThrow('Token symbol is required');
    });

    it('should throw error for invalid decimals', () => {
      const originalMethod = ecoTokenConfig.getTokenConfiguration;
      ecoTokenConfig.getTokenConfiguration = vi.fn(() => ({
        ...originalMethod.call(ecoTokenConfig),
        decimals: -1,
      }));

      expect(() => ecoTokenConfig.validateConfiguration()).toThrow(
        'Token decimals must be between 0 and 8'
      );

      ecoTokenConfig.getTokenConfiguration = vi.fn(() => ({
        ...originalMethod.call(ecoTokenConfig),
        decimals: 10,
      }));

      expect(() => ecoTokenConfig.validateConfiguration()).toThrow(
        'Token decimals must be between 0 and 8'
      );
    });

    it('should throw error for missing treasury account', () => {
      const originalMethod = ecoTokenConfig.getTokenConfiguration;
      ecoTokenConfig.getTokenConfiguration = vi.fn(() => ({
        ...originalMethod.call(ecoTokenConfig),
        treasuryAccountId: null as any,
      }));

      expect(() => ecoTokenConfig.validateConfiguration()).toThrow(
        'Treasury account ID is required'
      );
    });

    it('should throw error for missing keys', () => {
      const originalMethod = ecoTokenConfig.getTokenConfiguration;
      ecoTokenConfig.getTokenConfiguration = vi.fn(() => ({
        ...originalMethod.call(ecoTokenConfig),
        adminKey: '',
      }));

      expect(() => ecoTokenConfig.validateConfiguration()).toThrow(
        'Admin and supply keys are required'
      );

      ecoTokenConfig.getTokenConfiguration = vi.fn(() => ({
        ...originalMethod.call(ecoTokenConfig),
        adminKey: 'valid-key',
        supplyKey: '',
      }));

      expect(() => ecoTokenConfig.validateConfiguration()).toThrow(
        'Admin and supply keys are required'
      );
    });
  });
});