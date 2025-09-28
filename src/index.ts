import { apiService } from '@/services/api';
import { databaseService } from '@/services/database';
import { logger } from '@/utils/logger';
import config from '@/config';

async function main(): Promise<void> {
  try {
    logger.info('Starting Hedera Eco-Rewards System...');

    // Initialize database connection
    await databaseService.query('SELECT 1'); // Test connection
    logger.info('Database connection established');

    // Start API server
    await apiService.start();

    logger.info('Hedera Eco-Rewards System started successfully');
  } catch (error) {
    logger.error('Failed to start Hedera Eco-Rewards System:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  try {
    await databaseService.close();
    logger.info('Database connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  try {
    await databaseService.close();
    logger.info('Database connection closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the application
main().catch((error) => {
  logger.error('Unhandled error in main:', error);
  process.exit(1);
});
