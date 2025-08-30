import { Container } from 'inversify';
import { TYPES } from './types';

// Configuration Services
import { ConfigService } from '../config/config.service';

// Infrastructure Services
import { DatabaseService } from '../../infrastructure/persistence/database.service';

// Caching Services
import { ICacheService, CacheConfig } from '../../infrastructure/caching/cache.interface';
import { RedisCacheService } from '../../infrastructure/caching/redis-cache.service';
import { CacheManager } from '../../infrastructure/caching/cache-manager';
import { CacheMonitor } from '../../infrastructure/caching/cache-monitor';
import { CacheWarmupService } from '../../infrastructure/caching/cache-warmup.service';

// Repository Interfaces
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { ICleanupRepository } from '../../domain/repositories/cleanup-repository.interface';
import { ITokenRepository } from '../../domain/repositories/token-repository.interface';

// Repository Implementations
import { 
  PostgreSQLUserRepository,
  PostgreSQLCleanupRepository,
  PostgreSQLTokenRepository
} from '../../infrastructure/repositories/postgresql';

// Cached Repository Implementations
import {
  CachedUserRepository,
  CachedCleanupRepository,
  CachedTokenRepository
} from '../../infrastructure/repositories/cached';

// In-Memory Repository Implementations (for testing)
import {
  InMemoryUserRepository,
  InMemoryCleanupRepository,
  InMemoryTokenRepository
} from '../../infrastructure/repositories/in-memory';

// Domain Services
import { RewardCalculationService } from '../../domain/services/reward-calculation-service';
import { FraudDetectionService } from '../../domain/services/fraud-detection-service';

// Hedera Services
import { HederaTokenService } from '../../infrastructure/hedera/hedera-token-service';
import { HederaIdentityService } from '../../infrastructure/hedera/hedera-identity-service';
import { HederaConsensusService } from '../../infrastructure/hedera/hedera-consensus-service';

// Service Interfaces
import { ITokenService } from '../../domain/repositories/token-service.interface';
import { IIdentityService } from '../../domain/repositories/identity-service.interface';
import { IConsensusService } from '../../domain/repositories/consensus-service.interface';

// Use Cases
import { CreateUserUseCase } from '../../application/use-cases/create-user/create-user.use-case';
import { VerifyCleanupUseCase } from '../../application/use-cases/verify-cleanup/verify-cleanup.use-case';
import { MintTokensUseCase } from '../../application/use-cases/mint-tokens/mint-tokens.use-case';
import { IssueCredentialUseCase } from '../../application/use-cases/issue-credential/issue-credential.use-case';

// CQRS
import { CommandBus } from '../../application/commands/command-bus';
import { QueryBus } from '../../application/queries/query-bus';

// Event-Driven Messaging
import { EventBus } from '../../application/events/base/event.interface';
import { InMemoryEventBus } from '../../application/events/event-bus';
import { EnhancedEventBus } from '../../infrastructure/messaging/enhanced-event-bus';
import { EventStore, EventPublisher, EventSubscriber } from '../../infrastructure/messaging';
import { InMemoryEventStore } from '../../infrastructure/messaging/in-memory-event-store';
import { InMemoryEventPublisher } from '../../infrastructure/messaging/in-memory-event-publisher';
import { InMemoryEventSubscriber } from '../../infrastructure/messaging/in-memory-event-subscriber';

// Controllers
import { UserController } from '../../interfaces/api/controllers/user.controller';
import { CleanupController } from '../../interfaces/api/controllers/cleanup.controller';
import { TokenController } from '../../interfaces/api/controllers/token.controller';
import { AuditController } from '../../interfaces/api/controllers/audit.controller';

export function configureContainer(container: Container, environment: string = 'development'): void {
  // Configuration Services
  container.bind<ConfigService>(TYPES.ConfigService).to(ConfigService).inSingletonScope();

  // Infrastructure Services
  container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseService).inSingletonScope();

  // Caching Services
  container.bind<CacheConfig>('CacheConfig').toDynamicValue((context) => {
    const configService = context.container.get<ConfigService>(TYPES.ConfigService);
    const config = configService.getConfig();
    return {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      database: config.redis.database,
      keyPrefix: 'hedera-eco',
      defaultTtl: config.redis.ttl,
      maxRetries: 3,
      retryDelayOnFailover: 100,
    };
  }).inSingletonScope();

  container.bind<ICacheService>('ICacheService').to(RedisCacheService).inSingletonScope();
  container.bind<CacheManager>('CacheManager').to(CacheManager).inSingletonScope();
  container.bind<CacheMonitor>('CacheMonitor').to(CacheMonitor).inSingletonScope();
  container.bind<CacheWarmupService>('CacheWarmupService').to(CacheWarmupService).inSingletonScope();

  // Repository Bindings - Choose implementation based on environment
  if (environment === 'test') {
    // Use in-memory repositories for testing
    container.bind<IUserRepository>(TYPES.UserRepository).to(InMemoryUserRepository).inSingletonScope();
    container.bind<ICleanupRepository>(TYPES.CleanupRepository).to(InMemoryCleanupRepository).inSingletonScope();
    container.bind<ITokenRepository>(TYPES.TokenRepository).to(InMemoryTokenRepository).inSingletonScope();
  } else {
    // Bind base repositories first
    container.bind<IUserRepository>('BaseUserRepository').toDynamicValue((context) => {
      const databaseService = context.container.get<DatabaseService>(TYPES.DatabaseService);
      return new PostgreSQLUserRepository(databaseService.getConnection());
    }).inSingletonScope();

    container.bind<ICleanupRepository>('BaseCleanupRepository').toDynamicValue((context) => {
      const databaseService = context.container.get<DatabaseService>(TYPES.DatabaseService);
      return new PostgreSQLCleanupRepository(databaseService.getConnection());
    }).inSingletonScope();

    container.bind<ITokenRepository>('BaseTokenRepository').toDynamicValue((context) => {
      const databaseService = context.container.get<DatabaseService>(TYPES.DatabaseService);
      return new PostgreSQLTokenRepository(databaseService.getConnection());
    }).inSingletonScope();

    // Use cached repositories as the main implementation
    container.bind<IUserRepository>(TYPES.UserRepository).toDynamicValue((context) => {
      const baseRepository = context.container.get<IUserRepository>('BaseUserRepository');
      const cacheManager = context.container.get<CacheManager>('CacheManager');
      return new CachedUserRepository(baseRepository, cacheManager);
    }).inSingletonScope();

    container.bind<ICleanupRepository>(TYPES.CleanupRepository).toDynamicValue((context) => {
      const baseRepository = context.container.get<ICleanupRepository>('BaseCleanupRepository');
      const cacheManager = context.container.get<CacheManager>('CacheManager');
      return new CachedCleanupRepository(baseRepository, cacheManager);
    }).inSingletonScope();

    container.bind<ITokenRepository>(TYPES.TokenRepository).toDynamicValue((context) => {
      const baseRepository = context.container.get<ITokenRepository>('BaseTokenRepository');
      const cacheManager = context.container.get<CacheManager>('CacheManager');
      return new CachedTokenRepository(baseRepository, cacheManager);
    }).inSingletonScope();
  }

  // Domain Services
  container.bind<RewardCalculationService>(TYPES.RewardCalculationService).to(RewardCalculationService).inSingletonScope();
  container.bind<FraudDetectionService>(TYPES.FraudDetectionService).to(FraudDetectionService).inSingletonScope();

  // Hedera Services
  container.bind<ITokenService>(TYPES.TokenService).to(HederaTokenService).inSingletonScope();
  container.bind<IIdentityService>(TYPES.IdentityService).to(HederaIdentityService).inSingletonScope();
  container.bind<IConsensusService>(TYPES.ConsensusService).to(HederaConsensusService).inSingletonScope();

  // Use Cases
  container.bind<CreateUserUseCase>(TYPES.CreateUserUseCase).to(CreateUserUseCase).inSingletonScope();
  container.bind<VerifyCleanupUseCase>(TYPES.VerifyCleanupUseCase).to(VerifyCleanupUseCase).inSingletonScope();
  container.bind<MintTokensUseCase>(TYPES.MintTokensUseCase).to(MintTokensUseCase).inSingletonScope();
  container.bind<IssueCredentialUseCase>(TYPES.IssueCredentialUseCase).to(IssueCredentialUseCase).inSingletonScope();

  // CQRS
  container.bind<CommandBus>(TYPES.CommandBus).to(CommandBus).inSingletonScope();
  container.bind<QueryBus>(TYPES.QueryBus).to(QueryBus).inSingletonScope();

  // Event-Driven Messaging
  container.bind<EventStore>(TYPES.EventStore).to(InMemoryEventStore).inSingletonScope();
  container.bind<EventPublisher>(TYPES.EventPublisher).to(InMemoryEventPublisher).inSingletonScope();
  container.bind<EventSubscriber>(TYPES.EventSubscriber).to(InMemoryEventSubscriber).inSingletonScope();
  
  // Enhanced Event Bus with all messaging components
  container.bind<EventBus>(TYPES.EventBus).toDynamicValue((context) => {
    const eventStore = context.container.get<EventStore>(TYPES.EventStore);
    const eventPublisher = context.container.get<EventPublisher>(TYPES.EventPublisher);
    const eventSubscriber = context.container.get<EventSubscriber>(TYPES.EventSubscriber);
    
    return new EnhancedEventBus(
      eventStore,
      eventPublisher,
      eventSubscriber,
      {
        persistEvents: environment !== 'test', // Disable persistence in tests for speed
        publishToExternal: environment === 'production', // Only publish externally in production
        enableMetrics: true,
        maxRetries: 3,
        retryDelayMs: 1000
      }
    );
  }).inSingletonScope();

  // Controllers
  container.bind<UserController>(UserController).toSelf().inSingletonScope();
  container.bind<CleanupController>(CleanupController).toSelf().inSingletonScope();
  container.bind<TokenController>(TokenController).toSelf().inSingletonScope();
  container.bind<AuditController>(AuditController).toSelf().inSingletonScope();
}

export async function initializeServices(container: Container): Promise<void> {
  // Initialize database service
  const databaseService = container.get<DatabaseService>(TYPES.DatabaseService);
  await databaseService.initialize();

  // Initialize cache service
  try {
    const cacheService = container.get<ICacheService>('ICacheService');
    if (cacheService instanceof RedisCacheService) {
      await cacheService.connect();
    }
    console.log('Cache service initialized successfully');

    // Initialize cache warmup if enabled
    const warmupService = container.get<CacheWarmupService>('CacheWarmupService');
    await warmupService.warmupCache({
      enabled: process.env.NODE_ENV !== 'test', // Disable warmup in tests
      userProfiles: { enabled: true, topUsersCount: 50 },
      tokenBalances: { enabled: true, topHoldersCount: 25 },
      leaderboards: { enabled: true, types: ['weekly', 'monthly'] },
      cleanupHistory: { enabled: true, recentDays: 7, topUsersCount: 25 },
    });
    console.log('Cache warmup completed');
  } catch (error) {
    console.warn('Cache service initialization failed:', error.message);
    console.warn('Application will continue without caching');
  }

  // Initialize event-driven messaging
  try {
    const eventBus = container.get<EventBus>(TYPES.EventBus);
    const eventSubscriber = container.get<EventSubscriber>(TYPES.EventSubscriber);
    
    // Start external event subscription if available
    if (eventBus instanceof EnhancedEventBus) {
      await eventBus.startExternalSubscription();
    }
    
    console.log('Event-driven messaging initialized successfully');
  } catch (error) {
    console.warn('Event messaging initialization failed:', error.message);
    console.warn('Application will continue with basic event handling');
  }

  console.log('All services initialized successfully');
}