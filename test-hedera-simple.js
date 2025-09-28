import { 
  Client, 
  AccountId, 
  PrivateKey, 
  AccountBalanceQuery,
  TokenCreateTransaction
} from '@hashgraph/sdk';
import dotenv from 'dotenv';

dotenv.config();

async function testHederaConnection() {
  try {
    console.log('🌱 Testing Hedera connection...');
    
    // Create client
    const client = Client.forTestnet();
    
    // Set operator
    const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID || '');
    const operatorKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY || '');
    
    client.setOperator(operatorId, operatorKey);
    
    console.log('✅ Hedera client configured');
    console.log(`📋 Account ID: ${operatorId.toString()}`);
    
    // Test account balance
    const balance = await new AccountBalanceQuery()
      .setAccountId(operatorId)
      .execute(client);
    
    console.log(`💰 Account Balance: ${balance.hbars.toString()} HBAR`);
    
    // Test token creation
    console.log('🪙 Creating EcoToken...');
    const tokenCreateTransaction = new TokenCreateTransaction()
      .setTokenName('EcoToken')
      .setTokenSymbol('ECO')
      .setTokenType('FUNGIBLE_COMMON')
      .setDecimals(8)
      .setInitialSupply(1000000000)
      .setTreasuryAccountId(operatorId)
      .setSupplyType('INFINITE')
      .setAdminKey(operatorKey.publicKey)
      .setSupplyKey(operatorKey.publicKey)
      .freezeWith(client);
    
    const tokenResponse = await tokenCreateTransaction.execute(client);
    const tokenReceipt = await tokenResponse.getReceipt(client);
    const tokenId = tokenReceipt.tokenId;
    
    console.log(`✅ EcoToken created: ${tokenId.toString()}`);
    
    console.log('🎉 Hedera connection test passed!');
    console.log('🚀 Your account is ready for the Eco-Rewards System!');
    
  } catch (error) {
    console.error('❌ Hedera test failed:', error);
    process.exit(1);
  }
}

testHederaConnection();
