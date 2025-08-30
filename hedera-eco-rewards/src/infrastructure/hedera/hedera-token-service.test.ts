import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HederaTokenService, HederaTokenServiceError } from './hedera-token-service';
import { IConfigService } from '../../shared/config/config.interface';

// Mock the entire Hedera SDK to avoid complex mocking
vi.mock('@hashgraph/sdk', () => ({
  Client: {
    forTestnet: vi.fn(() => ({ setOperator: vi.fn() })),
    forMainnet: vi.fn(() => ({ setOperator: vi.fn() })),
  },
  TokenCreateTransaction: vi.fn(),
  TokenMintTransaction: vi.fn(),
  TransferTransaction: vi.fn(),
  TokenFreezeTransaction: vi.fn(),
  TokenUnfreezeTransaction: vi.fn(),
  TokenAssociateTransaction: vi.fn(),
  TokenDissociateTransaction: vi.fn(),
  TokenBurnTransaction: vi.fn(),
  AccountBalanceQuery: vi.fn(),
  TokenInfoQuery: vi.fn(),
  PrivateKey: {
    fromString: vi.fn(() => ({ publicKey: 'mock-public-key' })),
  },
  AccountId: {
    fromString: vi.fn((id) => ({ toString: () => id })),
  },
  TokenId: {
    fromString: vi.fn((id) => ({ toString: () => id })),
  },
  Status: { Success: 'SUCCESS' },
  TokenType: { FungibleCommon: 'FUNGIBLE_COMMON' },
  TokenSupplyType: { Infinite: 'INFINITE' },
  Hbar: vi.fn(),
}));

describe('HederaTokenService', () => {
  let tokenService: HederaTokenService;
  let mockConfigService: IConfigService;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          HEDERA_NETWORK: 'testnet',
          HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
          HEDERA_OPERATOR_PRIVATE_KEY: 'mock-private-key',
        };
        return config[key];
      }),
    } as IConfigService;

    tokenService = new HederaTokenService(mockConfigService);
  });

  describe('constructor', () => {
    it('should initialize with testnet configuration', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('HEDERA_NETWORK');
      expect(mockConfigService.get).toHaveBeenCalledWith('HEDERA_OPERATOR_ACCOUNT_ID');
      expect(mockConfigService.get).toHaveBeenCalledWith('HEDERA_OPERATOR_PRIVATE_KEY');
    });

    it('should throw error for unsupported network', () => {
      const invalidConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'HEDERA_NETWORK') return 'invalid-network';
          return 'mock-value';
        }),
      } as IConfigService;

      expect(() => new HederaTokenService(invalidConfigService)).toThrow(
        'Unsupported Hedera network: invalid-network'
      );
    });

    it('should initialize with mainnet configuration', () => {
      const mainnetConfigService = {
        get: vi.fn((key: string) => {
          const config: Record<string, string> = {
            HEDERA_NETWORK: 'mainnet',
            HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
            HEDERA_OPERATOR_PRIVATE_KEY: 'mock-private-key',
          };
          return config[key];
        }),
      } as IConfigService;

      expect(() => new HederaTokenService(mainnetConfigService)).not.toThrow();
    });
  });

  describe('error handling utilities', () => {
    it('should identify retryable errors correctly', () => {
      const isRetryableError = (tokenService as any).isRetryableError.bind(tokenService);

      // Retryable errors
      expect(isRetryableError(new Error('BUSY - Network is busy'))).toBe(true);
      expect(isRetryableError(new Error('TIMEOUT occurred'))).toBe(true);
      expect(isRetryableError(new Error('NETWORK_ERROR detected'))).toBe(true);
      expect(isRetryableError(new Error('Service UNAVAILABLE'))).toBe(true);
      expect(isRetryableError(new Error('PLATFORM_TRANSACTION_NOT_CREATED'))).toBe(true);

      // Non-retryable errors
      expect(isRetryableError(new Error('INVALID_ACCOUNT_ID'))).toBe(false);
      expect(isRetryableError(new Error('INSUFFICIENT_FUNDS'))).toBe(false);
      expect(isRetryableError(new Error('INVALID_TOKEN_ID'))).toBe(false);
      expect(isRetryableError(new Error('TOKEN_NOT_ASSOCIATED_TO_ACCOUNT'))).toBe(false);
    });

    it('should implement sleep utility', async () => {
      const sleep = (tokenService as any).sleep.bind(tokenService);
      const start = Date.now();
      
      await sleep(50); // 50ms sleep
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('HederaTokenServiceError', () => {
    it('should create error with code and message', () => {
      const error = new HederaTokenServiceError(
        'TEST_ERROR',
        'Test error message',
        new Error('Original error')
      );

      expect(error.name).toBe('HederaTokenServiceError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.cause).toBeInstanceOf(Error);
    });

    it('should create error without cause', () => {
      const error = new HederaTokenServiceError('TEST_ERROR', 'Test error message');

      expect(error.name).toBe('HederaTokenServiceError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.cause).toBeUndefined();
    });
  });

  describe('configuration validation', () => {
    it('should handle missing configuration gracefully', () => {
      const emptyConfigService = {
        get: vi.fn(() => undefined),
      } as IConfigService;

      expect(() => new HederaTokenService(emptyConfigService)).toThrow();
    });

    it('should validate network configuration', () => {
      const configs = [
        { network: 'testnet', shouldPass: true },
        { network: 'mainnet', shouldPass: true },
        { network: 'previewnet', shouldPass: false },
        { network: 'localnet', shouldPass: false },
        { network: '', shouldPass: false },
      ];

      configs.forEach(({ network, shouldPass }) => {
        const configService = {
          get: vi.fn((key: string) => {
            if (key === 'HEDERA_NETWORK') return network;
            return 'mock-value';
          }),
        } as IConfigService;

        if (shouldPass) {
          expect(() => new HederaTokenService(configService)).not.toThrow();
        } else {
          expect(() => new HederaTokenService(configService)).toThrow();
        }
      });
    });
  });

  describe('service initialization', () => {
    it('should initialize without throwing errors', () => {
      expect(() => {
        new HederaTokenService(mockConfigService);
      }).not.toThrow();
    });

    it('should handle different network configurations', () => {
      const networks = ['testnet', 'mainnet'];
      
      networks.forEach(network => {
        const configService = {
          get: vi.fn((key: string) => {
            if (key === 'HEDERA_NETWORK') return network;
            if (key === 'HEDERA_OPERATOR_ACCOUNT_ID') return '0.0.12345';
            if (key === 'HEDERA_OPERATOR_PRIVATE_KEY') return 'mock-key';
            return undefined;
          }),
        } as IConfigService;

        expect(() => new HederaTokenService(configService)).not.toThrow();
      });
    });
  });
});