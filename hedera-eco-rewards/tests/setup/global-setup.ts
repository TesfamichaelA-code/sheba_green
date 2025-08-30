import { execSync } from 'child_process';
import { ConfigService } from '../../src/shared/config/config.service';
import { DatabaseService } from '../../src/infrastructure/persistence/database.service';

export async function setup() {
  console.log('🚀 Starting global integration test setup...');
  
  try {
    // Load configuration
    const configService = new ConfigService();
    
    // Ensure we're in test environment
    if (configService.get('NODE_ENV') !== 'integration') {
      throw new Error('Integration tests must run in integration environment');
    }
    
    // Check Hedera testnet credentials
    const hederaAccountId = configService.get('HEDERA_ACCOUNT_ID');
    const hederaPrivateKey = configService.get('HEDERA_PRIVATE_KEY');
    
    if (!hederaAccountId || !hederaPrivateKey) {
      console.warn('⚠️  Hedera testnet credentials not found. Some tests may be skipped.');
    } else {
      console.log('✅ Hedera testnet credentials configured');
    }
    
    // Initialize database
    console.log('📊 Setting up test database...');
    const databaseService = new DatabaseService();
    await databaseService.connect();
    
    // Run migrations
    console.log('🔄 Running database migrations...');
    try {
      execSync('npm run migrate:integration', { stdio: 'inherit' });
      console.log('✅ Database migrations completed');
    } catch (error) {
      console.error('❌ Database migration failed:', error);
      throw error;
    }
    
    // Seed test data if needed
    console.log('🌱 Seeding test data...');
    try {
      execSync('npm run seed:integration', { stdio: 'inherit' });
      console.log('✅ Test data seeded');
    } catch (error) {
      console.warn('⚠️  Test data seeding failed (continuing anyway):', error);
    }
    
    await databaseService.disconnect();
    
    // Verify external services
    console.log('🔍 Verifying external service connectivity...');
    
    // Check Redis connectivity
    try {
      const redis = require('redis');
      const client = redis.createClient({
        url: configService.get('REDIS_URL')
      });
      await client.connect();
      await client.ping();
      await client.disconnect();
      console.log('✅ Redis connectivity verified');
    } catch (error) {
      console.error('❌ Redis connectivity failed:', error);
      throw error;
    }
    
    // Verify Hedera network connectivity
    if (hederaAccountId && hederaPrivateKey) {
      try {
        const { Client, AccountBalanceQuery } = require('@hashgraph/sdk');
        
        const client = Client.forTestnet();
        client.setOperator(hederaAccountId, hederaPrivateKey);
        
        const balance = await new AccountBalanceQuery()
          .setAccountId(hederaAccountId)
          .execute(client);
        
        client.close();
        console.log('✅ Hedera testnet connectivity verified');
        console.log(`   Account balance: ${balance.hbars.toString()}`);
      } catch (error) {
        console.error('❌ Hedera testnet connectivity failed:', error);
        throw error;
      }
    }
    
    console.log('🎉 Global integration test setup completed successfully');
    
  } catch (error) {
    console.error('💥 Global integration test setup failed:', error);
    throw error;
  }
}

export async function teardown() {
  console.log('🧹 Starting global integration test teardown...');
  
  try {
    // Clean up test database
    console.log('🗑️  Cleaning up test database...');
    const configService = new ConfigService();
    const databaseService = new DatabaseService();
    
    await databaseService.connect();
    
    // Clean up test data
    await databaseService.query('TRUNCATE TABLE users, cleanups, tokens, credentials CASCADE');
    
    await databaseService.disconnect();
    
    console.log('✅ Global integration test teardown completed');
    
  } catch (error) {
    console.error('💥 Global integration test teardown failed:', error);
    // Don't throw here to avoid masking test failures
  }
}