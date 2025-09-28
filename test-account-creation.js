const { Client, AccountId, PrivateKey, TransferTransaction, Hbar } = require('@hashgraph/sdk');
require('dotenv').config();

async function testAccountCreation() {
  try {
    console.log('🧪 Testing Hedera account creation...');
    
    // Create client
    const client = Client.forTestnet();
    client.setOperator(
      AccountId.fromString(process.env.HEDERA_OPERATOR_ID || '0.0.6291912'),
      PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY || '3030020100300706052b8104000a04220420d34a8f201964edc0ee37baea98d045ffdc7f4c180941665467bbbd4b59656d0e')
    );
    
    console.log('✅ Client configured');
    
    // Generate new key pair
    const userPrivateKey = PrivateKey.generateED25519();
    const userPublicKey = userPrivateKey.publicKey;
    
    console.log('✅ Generated key pair');
    console.log('Public Key:', userPublicKey.toString());
    
    // Try to get account ID from public key
    try {
      const accountId = userPublicKey.toAccountId();
      console.log('✅ Account ID from public key:', accountId.toString());
      
      // Create account by transferring HBAR
      const transferResponse = await new TransferTransaction()
        .addHbarTransfer(AccountId.fromString(process.env.HEDERA_OPERATOR_ID), new Hbar(-10))
        .addHbarTransfer(accountId, new Hbar(10))
        .execute(client);
      
      const receipt = await transferResponse.getReceipt(client);
      const newAccountId = receipt.accountId.toString();
      
      console.log('✅ Account created successfully:', newAccountId);
      console.log('🔑 Private Key:', userPrivateKey.toString());
      
    } catch (error) {
      console.error('❌ Error creating account:', error.message);
      
      // Alternative approach - use AccountCreateTransaction
      console.log('🔄 Trying alternative approach...');
      
      const { AccountCreateTransaction } = require('@hashgraph/sdk');
      
      const accountCreateTransaction = new AccountCreateTransaction()
        .setKey(userPublicKey)
        .setInitialBalance(new Hbar(10))
        .freezeWith(client);
      
      const response = await accountCreateTransaction.execute(client);
      const receipt = await response.getReceipt(client);
      const newAccountId = receipt.accountId.toString();
      
      console.log('✅ Account created with AccountCreateTransaction:', newAccountId);
      console.log('🔑 Private Key:', userPrivateKey.toString());
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAccountCreation();
