# Hedera Infrastructure Integration

This module provides comprehensive integration with Hedera Hashgraph services including Token Service (HTS), Consensus Service (HCS), and Identity/DID services for the EcoRewards system.

## Components

### HederaConsensusService

The consensus service implements the `IConsensusService` interface using Hedera Consensus Service (HCS) for immutable audit trails and event logging.

**Features:**
- Topic creation and management
- Message submission with chunking support
- Real-time message subscriptions
- Message querying and filtering
- Comprehensive error handling with retry mechanisms
- Support for both testnet and mainnet

### AuditTrailService

High-level service for logging system events to Hedera Consensus Service with structured event types and automatic topic routing.

**Features:**
- Structured system event logging
- Automatic topic routing (audit vs security events)
- Batch event processing
- Event creation helpers
- Comprehensive event type definitions

### HederaTokenService

The main service class that implements the `ITokenService` interface using the Hedera SDK.

**Features:**
- Token creation with configurable parameters
- Token minting and burning
- Token transfers between accounts
- Account balance queries
- Token association/dissociation
- Account freezing/unfreezing
- Comprehensive error handling with retry mechanisms
- Support for both testnet and mainnet

### EcoTokenConfig

Configuration management for the EcoToken used in the rewards system.

**Features:**
- Default EcoToken configuration
- Treasury account management
- Configuration validation
- Environment-based configuration

## Configuration

The service requires the following environment variables:

```bash
# Hedera Network Configuration
HEDERA_NETWORK=testnet                    # or mainnet
HEDERA_OPERATOR_ACCOUNT_ID=0.0.12345     # Your operator account
HEDERA_OPERATOR_PRIVATE_KEY=your_key     # Your operator private key

# Optional Treasury Configuration (defaults to operator)
HEDERA_TREASURY_ACCOUNT_ID=0.0.67890     # Treasury account for token
HEDERA_TREASURY_PRIVATE_KEY=treasury_key # Treasury private key

# Optional Token Configuration
HEDERA_TOKEN_ID=0.0.54321                # Existing token ID (if already created)

# Mirror Node Configuration (for consensus service queries)
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
```

## Usage

### Consensus Service and Audit Trail

```typescript
import { HederaConsensusService, AuditTrailService, SystemEventType } from './infrastructure/hedera';

// Initialize services
const consensusService = new HederaConsensusService(configService);
const auditService = new AuditTrailService(consensusService, configService);

// Initialize audit trail topics
await auditService.initialize();

// Log user registration event
const userEvent = auditService.createUserCreatedEvent(
  'user-123',
  '0.0.98765',
  'did:hedera:testnet:0.0.98765',
  { name: 'John Doe', email: 'john@example.com' }
);

const transactionId = await auditService.logEvent(userEvent);
console.log(`Event logged: ${transactionId}`);

// Subscribe to real-time events
const subscription = await consensusService.subscribeToTopic(
  auditService.getAuditTopicId()!,
  (message) => {
    const event = JSON.parse(message.contents);
    console.log(`Received event: ${event.type}`);
  }
);

// Create custom topic for specific use case
const cleanupTopicId = await consensusService.createTopic({
  memo: 'Cleanup Verification Events',
  autoRenewPeriod: 7776000, // 90 days
});

// Submit custom message
await consensusService.submitMessage(
  cleanupTopicId,
  JSON.stringify({
    type: 'CLEANUP_SUBMITTED',
    cleanupId: 'cleanup-456',
    userId: 'user-123',
    timestamp: new Date().toISOString(),
  })
);
```

### Basic Token Operations

```typescript
import { HederaTokenService, EcoTokenConfig } from './infrastructure/hedera';
import { TokenAmount } from './domain/value-objects/token-amount';
import { HederaAccountId } from './domain/value-objects/hedera-account-id';

// Initialize services
const tokenService = new HederaTokenService(configService);
const ecoTokenConfig = new EcoTokenConfig(configService);

// Create EcoToken
const tokenConfig = ecoTokenConfig.getTokenConfiguration();
const tokenId = await tokenService.createToken(tokenConfig);

// Mint tokens to user
const userAccount = new HederaAccountId('0.0.98765');
const amount = new TokenAmount(1000n); // 10.00 ECO (2 decimals)
await tokenService.mintTokens(tokenId, userAccount, amount);

// Check balance
const balance = await tokenService.getBalance(userAccount, tokenId);
console.log(`Balance: ${balance.toString()} ECO tokens`);
```

### Error Handling

The service includes comprehensive error handling:

```typescript
try {
  await tokenService.mintTokens(tokenId, accountId, amount);
} catch (error) {
  if (error instanceof HederaTokenServiceError) {
    console.error(`Token operation failed: ${error.code}`, error.message);
    // Handle specific error codes
    switch (error.code) {
      case 'TOKEN_MINTING_FAILED':
        // Handle minting failure
        break;
      case 'INSUFFICIENT_BALANCE':
        // Handle insufficient balance
        break;
    }
  }
}
```

### Retry Mechanism

The service automatically retries operations on transient failures:

- Network timeouts
- Busy network conditions
- Platform transaction creation failures

Non-retryable errors (like invalid account IDs) fail immediately.

## Testing

### Unit Tests

Run unit tests for the service logic:

```bash
npm test src/infrastructure/hedera/hedera-token-service.test.ts
npm test src/infrastructure/hedera/hedera-consensus-service.test.ts
npm test src/infrastructure/hedera/audit-trail-service.test.ts
npm test src/infrastructure/hedera/eco-token-config.test.ts
```

### Integration Tests

Integration tests require valid Hedera testnet credentials:

```bash
# Set environment variables
export HEDERA_INTEGRATION_TEST=true
export HEDERA_NETWORK=testnet
export HEDERA_OPERATOR_ACCOUNT_ID=0.0.YOUR_ACCOUNT
export HEDERA_OPERATOR_PRIVATE_KEY=your_private_key

# Run integration tests
npm test src/infrastructure/hedera/hedera-token-service.integration.test.ts
npm test src/infrastructure/hedera/hedera-consensus-service.integration.test.ts
```

**Note:** Integration tests will create actual tokens on Hedera testnet and consume test HBAR.

## EcoToken Specifications

The default EcoToken configuration:

- **Name:** ShebaGreen EcoToken
- **Symbol:** ECO
- **Decimals:** 2 (allows amounts like 10.50 ECO)
- **Supply Type:** Infinite (can mint as needed)
- **Initial Supply:** 0 (mint tokens as rewards are earned)

## Security Considerations

1. **Private Key Management:** Store private keys securely, never in code
2. **Network Selection:** Use testnet for development, mainnet for production
3. **Key Rotation:** Implement regular key rotation for production
4. **Access Control:** Limit who can perform token operations
5. **Audit Trails:** All operations are logged to Hedera Consensus Service
6. **Consensus Service Security:** Use appropriate submit keys for HCS topics
7. **Message Integrity:** All consensus messages are cryptographically secured

## Performance

- **Transaction Throughput:** ~10,000 TPS on Hedera network
- **Finality:** 3-5 seconds for transaction confirmation
- **Fees:** Low, predictable fees (typically < $0.01 per transaction)
- **Retry Logic:** Exponential backoff for failed operations

## Monitoring

The service provides detailed error codes and logging for monitoring:

- Transaction success/failure rates
- Network latency and retry counts
- Token supply and distribution metrics
- Account balance changes

## Hedera Identity Service Integration

### HederaIdentityService

The identity service implements the `IIdentityService` interface for managing decentralized identities and verifiable credentials on Hedera.

**Features:**
- **DID Creation**: Generate new Hedera DIDs with Ed25519 key pairs
- **DID Resolution**: Retrieve DID documents from Hedera Consensus Service
- **DID Updates**: Modify DID documents with version control
- **Credential Issuance**: Issue W3C-compliant verifiable credentials
- **Credential Verification**: Cryptographically verify credentials and presentations
- **Credential Revocation**: Revoke credentials with audit trail
- **Presentation Creation**: Create verifiable presentations from multiple credentials

### KeyManager

Provides comprehensive cryptographic key management:
- **Key Generation**: Ed25519 key pair generation
- **Key Storage**: Secure in-memory key storage with metadata
- **Key Rotation**: Automatic key rotation with archival
- **Key Export**: Multiple format support (raw, PEM, JWK, multibase)
- **Digital Signatures**: Sign and verify operations

### Identity Service Usage

```typescript
import { HederaIdentityService, HederaIdentityConfig } from './infrastructure/hedera';
import { Client, PrivateKey } from '@hashgraph/sdk';

const client = Client.forTestnet();
const operatorKey = PrivateKey.fromStringED25519('your-private-key');

const config: HederaIdentityConfig = {
  client,
  operatorPrivateKey: operatorKey,
  didTopicId: 'your-did-topic-id',
  credentialTopicId: 'your-credential-topic-id',
};

const identityService = new HederaIdentityService(config);

// Create a new DID
const userInfo = {
  name: 'John Doe',
  email: 'john@example.com',
};

const did = await identityService.createDID(userInfo);

// Issue a credential
const credential = {
  context: ['https://www.w3.org/2018/credentials/v1'],
  id: 'credential-id',
  type: ['VerifiableCredential', 'EcoCleanupCredential'],
  issuer: did,
  issuanceDate: new Date(),
  credentialSubject: {
    id: did,
    cleanupCount: 5,
    tokensEarned: 100,
  },
  proof: {
    type: 'Ed25519Signature2020',
    created: new Date(),
    verificationMethod: `${did}#key-1`,
    proofPurpose: 'assertionMethod',
  },
};

const credentialId = await identityService.issueCredential(did, credential);
```

### Key Management Usage

```typescript
import { KeyManager } from './infrastructure/hedera';

const keyManager = new KeyManager();

// Generate a new key pair
const keyPair = keyManager.generateKeyPair('authentication', 'did:hedera:0.0.123:controller');

// Export public key in different formats
const rawKey = keyManager.exportPublicKey(keyId, 'raw');
const jwkKey = keyManager.exportPublicKey(keyId, 'jwk');

// Sign and verify data
const data = new TextEncoder().encode('message to sign');
const signature = keyManager.sign(keyId, data);
const isValid = keyManager.verify(keyId, data, signature);
```

### Identity Integration Tests

Integration tests require Hedera testnet credentials:

```bash
# Set environment variables
export HEDERA_OPERATOR_ID="0.0.YOUR_ACCOUNT_ID"
export HEDERA_OPERATOR_KEY="your-private-key"
export INTEGRATION_TESTS=true

# Run integration tests
npm test hedera-identity-service.integration.test.ts
```

### Security Considerations for Identity

- **Key Management**: Private keys are stored in memory only. For production, use HSM or secure key storage
- **Credential Verification**: Always verify credential signatures and check revocation status
- **DID Resolution**: Implement caching and rate limiting for DID resolution
- **Topic Security**: Use appropriate submit keys for HCS topics to prevent unauthorized messages

## Future Enhancements

Planned improvements:

1. **Batch Operations:** Support for batch token transfers
2. **Scheduled Transactions:** Time-delayed token operations
3. **Multi-Signature:** Support for multi-sig treasury accounts
4. **Token Metadata:** Enhanced token information and metadata
5. **Compliance Features:** KYC/AML integration capabilities
6. **DID Registry:** Centralized DID registry for faster resolution
7. **Credential Templates:** Pre-defined credential schemas for common use cases
8. **Biometric Integration:** Support for biometric-based credential verification
9. **Zero-Knowledge Proofs:** Privacy-preserving credential verification