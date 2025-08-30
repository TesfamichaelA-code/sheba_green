import { Container } from 'inversify';
import { TYPES } from '@shared/container/types';
import { IConfigService } from '@shared/config/config.interface';
import { EcoTokenConfig } from '@infrastructure/hedera/eco-token-config';

/**
 * Health Check Service
 * 
 * Provides health checks for various system components
 */
export class HealthCheck {
  constructor(private container: Container) {}

  /**
   * Check if all core services are properly initialized
   */
  async checkCoreServices(): Promise<HealthCheckResult> {
    const results: HealthCheckItem[] = [];

    try {
      // Check configuration service
      const configService = this.container.get<IConfigService>(TYPES.ConfigService);
      const config = configService.getConfig();
      results.push({
        name: 'Configuration Service',
        status: 'healthy',
        details: `Environment: ${config.environment}`,
      });
    } catch (error) {
      results.push({
        name: 'Configuration Service',
        status: 'unhealthy',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    try {
      // Check EcoToken configuration
      const ecoTokenConfig = this.container.get<EcoTokenConfig>(TYPES.EcoTokenConfig);
      ecoTokenConfig.validateConfiguration();
      const tokenConfig = ecoTokenConfig.getTokenConfiguration();
      results.push({
        name: 'EcoToken Configuration',
        status: 'healthy',
        details: `Token: ${tokenConfig.name} (${tokenConfig.symbol})`,
      });
    } catch (error) {
      results.push({
        name: 'EcoToken Configuration',
        status: 'unhealthy',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const overallStatus = results.every(r => r.status === 'healthy') ? 'healthy' : 'unhealthy';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: results,
    };
  }

  /**
   * Check Hedera network connectivity (basic validation)
   */
  async checkHederaConnectivity(): Promise<HealthCheckResult> {
    const results: HealthCheckItem[] = [];

    try {
      const configService = this.container.get<IConfigService>(TYPES.ConfigService);
      const config = configService.getConfig();
      
      // Basic validation of Hedera configuration
      if (!config.hedera.operatorAccountId || !config.hedera.operatorPrivateKey) {
        throw new Error('Missing Hedera operator credentials');
      }

      results.push({
        name: 'Hedera Configuration',
        status: 'healthy',
        details: `Network: ${config.hedera.network}, Account: ${config.hedera.operatorAccountId}`,
      });

      // Note: Actual network connectivity would require making a real API call
      // This is just configuration validation for now
      results.push({
        name: 'Hedera Network',
        status: 'healthy',
        details: 'Configuration valid (network connectivity not tested)',
      });

    } catch (error) {
      results.push({
        name: 'Hedera Network',
        status: 'unhealthy',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const overallStatus = results.every(r => r.status === 'healthy') ? 'healthy' : 'unhealthy';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: results,
    };
  }

  /**
   * Check if the application is ready to serve requests
   */
  async checkReadiness(): Promise<ReadinessCheckResult> {
    const results: HealthCheckItem[] = [];

    try {
      // Check if core services are initialized
      const coreCheck = await this.checkCoreServices();
      const coreHealthy = coreCheck.status === 'healthy';
      
      results.push({
        name: 'Core Services',
        status: coreHealthy ? 'healthy' : 'unhealthy',
        details: coreHealthy ? 'All core services initialized' : 'Some core services failed',
      });

      // Check if Hedera configuration is valid
      const hederaCheck = await this.checkHederaConnectivity();
      const hederaHealthy = hederaCheck.status === 'healthy';
      
      results.push({
        name: 'Hedera Services',
        status: hederaHealthy ? 'healthy' : 'unhealthy',
        details: hederaHealthy ? 'Hedera configuration valid' : 'Hedera configuration invalid',
      });

      // TODO: Add database readiness check when implemented
      // TODO: Add Redis readiness check when implemented

    } catch (error) {
      results.push({
        name: 'Readiness Check',
        status: 'unhealthy',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const isReady = results.every(r => r.status === 'healthy');

    return {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: results,
    };
  }

  /**
   * Run all health checks
   */
  async checkAll(): Promise<HealthCheckResult> {
    const coreCheck = await this.checkCoreServices();
    const hederaCheck = await this.checkHederaConnectivity();

    const allChecks = [...coreCheck.checks, ...hederaCheck.checks];
    const overallStatus = allChecks.every(r => r.status === 'healthy') ? 'healthy' : 'unhealthy';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: allChecks,
    };
  }
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  checks: HealthCheckItem[];
}

export interface ReadinessCheckResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: HealthCheckItem[];
}

export interface HealthCheckItem {
  name: string;
  status: 'healthy' | 'unhealthy';
  details: string;
}