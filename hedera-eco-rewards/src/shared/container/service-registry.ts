import { Container } from 'inversify';
import { TYPES } from './types';

// Core services
import { ConfigService } from '@shared/config/config.service';
import { IConfigService } from '@shared/config/config.interface';

// Hedera services
import { HederaTokenService } from '@infrastructure/hedera/hedera-token-service';
import { EcoTokenConfig } from '@infrastructure/hedera/eco-token-config';
import { ITokenService } from '@domain/repositories/token-service.interface';

/**
 * Service Registry
 * 
 * Centralized service registration for dependency injection.
 * This keeps the main bootstrap function clean and organized.
 */
export class ServiceRegistry {
  /**
   * Register all core services
   */
  static registerCoreServices(container: Container): void {
    // Configuration service
    container.bind<IConfigService>(TYPES.ConfigService).to(ConfigService);
  }

  /**
   * Register Hedera-related services
   */
  static registerHederaServices(container: Container): void {
    // Token service
    container.bind<ITokenService>(TYPES.TokenService).to(HederaTokenService);
    
    // EcoToken configuration
    container.bind<EcoTokenConfig>(TYPES.EcoTokenConfig).to(EcoTokenConfig);
  }

  /**
   * Register repository services
   */
  static registerRepositories(container: Container): void {
    // TODO: Register repository implementations when database layer is implemented
    // container.bind<IUserRepository>(TYPES.UserRepository).to(PostgreSQLUserRepository);
    // container.bind<ICleanupRepository>(TYPES.CleanupRepository).to(PostgreSQLCleanupRepository);
    // container.bind<ITokenRepository>(TYPES.TokenRepository).to(PostgreSQLTokenRepository);
  }

  /**
   * Register application services
   */
  static registerApplicationServices(container: Container): void {
    // TODO: Register use cases and application services
    // container.bind<CreateUserUseCase>(TYPES.CreateUserUseCase).to(CreateUserUseCase);
    // container.bind<VerifyCleanupUseCase>(TYPES.VerifyCleanupUseCase).to(VerifyCleanupUseCase);
    // container.bind<MintTokensUseCase>(TYPES.MintTokensUseCase).to(MintTokensUseCase);
  }

  /**
   * Register all services in the correct order
   */
  static registerAll(container: Container): void {
    this.registerCoreServices(container);
    this.registerHederaServices(container);
    this.registerRepositories(container);
    this.registerApplicationServices(container);
  }
}