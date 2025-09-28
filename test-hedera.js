import { 
  Client, 
  AccountId, 
  PrivateKey, 
  AccountBalanceQuery,
  TransferTransaction,
  Hbar,
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
    
    // Test creating a new account
    console.log('🔄 Creating test account...');
    const newAccountPrivateKey = PrivateKey.generateED25519();
    const newAccountPublicKey = newAccountPrivateKey.publicKey;
    
    const response = await new TransferTransaction()
      .addHbarTransfer(operatorId, new Hbar(-10))
      .addHbarTransfer(newAccountPublicKey.toAccountId(), new Hbar(10))
      .execute(client);
    
    const receipt = await response.getReceipt(client);
    const newAccountId = receipt.accountId;
    
    console.log(`✅ Test account created: ${newAccountId.toString()}`);
    console.log(`🔑 Private Key: ${newAccountPrivateKey.toString()}`);
    
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
    
    console.log('🎉 All Hedera tests passed!');
    
  } catch (error) {
    console.error('❌ Hedera test failed:', error);
    process.exit(1);
  }
}

testHederaConnection();
