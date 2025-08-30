import 'reflect-metadata';
import { container } from '@shared/container/container';
import { TYPES } from '@shared/container/types';
import { ServiceRegistry } from '@shared/container/service-registry';
import { HealthCheck } from '@shared/health/health-check';
import { IConfigService } from '@shared/config/config.interface';
import { EcoTokenConfig } from '@infrastructure/hedera/eco-token-config';
import { ITokenService } from '@domain/repositories/token-service.interface';
import { Server } from '@interfaces/api/server';

/**
 * Application Entry Point
 *
 * Initializes the Hedera Eco-Rewards System with proper dependency injection,
 * configuration management, and clean architecture setup.
 */

let server: Server;

async function bootstrap(): Promise<void> {
  try {
    // Register all services
    ServiceRegistry.registerAll(container);

    // Get configuration service
    const configService = container.get<IConfigService>(TYPES.ConfigService);
    const config = configService.getConfig();

    // eslint-disable-next-line no-console
    console.log(`Starting Hedera Eco-Rewards System in ${config.environment} mode`);
    // eslint-disable-next-line no-console
    console.log(`Hedera Network: ${config.hedera.network}`);

    // Initialize and validate Hedera services
    const tokenService = container.get<ITokenService>(TYPES.TokenService);
    const ecoTokenConfig = container.get<EcoTokenConfig>(TYPES.EcoTokenConfig);
    
    // Validate EcoToken configuration
    ecoTokenConfig.validateConfiguration();
    // eslint-disable-next-line no-console
    console.log('✓ Hedera Token Service initialized and validated');

    // Check if EcoToken already exists
    const existingTokenId = ecoTokenConfig.getExistingTokenId();
    if (existingTokenId) {
      // eslint-disable-next-line no-console
      console.log(`✓ Using existing EcoToken: ${existingTokenId}`);
    } else {
      // eslint-disable-next-line no-console
      console.log('ℹ No existing EcoToken found. Create one using the token service when needed.');
    }

    // Run health checks
    const healthCheck = new HealthCheck(container);
    const healthResult = await healthCheck.checkAll();
    
    if (healthResult.status === 'healthy') {
      // eslint-disable-next-line no-console
      console.log('✅ All health checks passed');
      healthResult.checks.forEach(check => {
        // eslint-disable-next-line no-console
        console.log(`  ✓ ${check.name}: ${check.details}`);
      });
    } else {
      // eslint-disable-next-line no-console
      console.warn('⚠️ Some health checks failed:');
      healthResult.checks.forEach(check => {
        const icon = check.status === 'healthy' ? '✓' : '✗';
        // eslint-disable-next-line no-console
        console.log(`  ${icon} ${check.name}: ${check.details}`);
      });
    }

    // Initialize and start API server
    server = new Server(container);
    server.setupGracefulShutdown();
    await server.start();

    // eslint-disable-next-line no-console
    console.log('✅ Hedera Eco-Rewards System started successfully');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error: Error) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  // eslint-disable-next-line no-console
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  // eslint-disable-next-line no-console
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the application
(async () => {
  try {
    await bootstrap();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failed:', error);
    process.exit(1);
  }
})();
