// Simple integration test to verify the services can be instantiated
const { container } = require('./dist/shared/container/container.js');
const { ServiceRegistry } = require('./dist/shared/container/service-registry.js');
const { TYPES } = require('./dist/shared/container/types.js');

async function testIntegration() {
  try {
    console.log('🧪 Testing Hedera Token Service Integration...');
    
    // Set up minimal environment variables for testing
    process.env.HEDERA_NETWORK = 'testnet';
    process.env.HEDERA_OPERATOR_ACCOUNT_ID = '0.0.12345';
    process.env.HEDERA_OPERATOR_PRIVATE_KEY = 'test-key';
    process.env.NODE_ENV = 'development';
    process.env.API_PORT = '3000';
    process.env.API_HOST = 'localhost';
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'test';
    process.env.DB_USERNAME = 'test';
    process.env.DB_PASSWORD = 'test';
    process.env.JWT_SECRET = 'test-secret-key-at-least-32-chars';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';
    process.env.AI_VERIFICATION_SERVICE_URL = 'http://localhost:8080';
    process.env.AI_VERIFICATION_API_KEY = 'test-key';
    process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:8081';
    process.env.HEDERA_MIRROR_NODE_URL = 'https://testnet.mirrornode.hedera.com';
    
    // Register services
    ServiceRegistry.registerAll(container);
    console.log('✅ Services registered successfully');
    
    // Test configuration service
    const configService = container.get(TYPES.ConfigService);
    const config = configService.getConfig();
    console.log(`✅ Configuration loaded: ${config.environment} environment`);
    
    // Test EcoToken configuration
    const ecoTokenConfig = container.get(TYPES.EcoTokenConfig);
    ecoTokenConfig.validateConfiguration();
    const tokenConfig = ecoTokenConfig.getTokenConfiguration();
    console.log(`✅ EcoToken config validated: ${tokenConfig.name} (${tokenConfig.symbol})`);
    
    // Test token service instantiation
    const tokenService = container.get(TYPES.TokenService);
    console.log('✅ HederaTokenService instantiated successfully');
    
    console.log('\n🎉 Integration test passed! Hedera Token Service is fully integrated.');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    process.exit(1);
  }
}

testIntegration();