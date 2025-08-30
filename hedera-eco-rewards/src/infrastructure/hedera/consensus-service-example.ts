/**
 * Hedera Consensus Service Usage Examples
 * 
 * This file demonstrates how to use the HederaConsensusService and AuditTrailService
 * in real application scenarios for the ShebaGreen eco-rewards system.
 */

import { HederaConsensusService } from './hedera-consensus-service';
import { AuditTrailService, SystemEventType } from './audit-trail-service';
import { IConfigService } from '../../shared/config/config.interface';

/**
 * Example: Setting up audit trail for user registration
 */
export async function setupUserRegistrationAudit(
  consensusService: HederaConsensusService,
  auditService: AuditTrailService
): Promise<void> {
  // Initialize audit trail service
  await auditService.initialize();

  // Example user registration event
  const userCreatedEvent = auditService.createUserCreatedEvent(
    'user-12345',
    '0.0.98765',
    'did:hedera:testnet:0.0.98765',
    {
      name: 'Abebe Kebede',
      email: 'abebe@example.com',
      location: 'Addis Ababa, Ethiopia',
      phoneNumber: '+251911234567',
    },
    'session-abc123'
  );

  // Log the event to Hedera Consensus Service
  const transactionId = await auditService.logEvent(userCreatedEvent);
  console.log(`User registration logged to HCS: ${transactionId}`);
}

/**
 * Example: Logging cleanup verification workflow
 */
export async function logCleanupVerificationWorkflow(
  auditService: AuditTrailService,
  cleanupId: string,
  userId: string
): Promise<void> {
  const events = [];

  // 1. Cleanup submitted event
  events.push({
    type: SystemEventType.CLEANUP_SUBMITTED,
    timestamp: new Date().toISOString(),
    userId,
    data: {
      cleanupId,
      userId,
      location: {
        latitude: 9.0320,
        longitude: 38.7469,
        address: 'Meskel Square, Addis Ababa',
      },
      metrics: {
        wasteAmount: 15.5, // kg
        wasteType: 'plastic_bottles',
        area: 100, // square meters
      },
      images: ['image1.jpg', 'image2.jpg', 'image3.jpg'],
    },
  });

  // 2. AI verification completed
  const aiVerificationData = {
    confidence: 0.92,
    wasteDetected: true,
    wasteTypes: ['plastic_bottles', 'food_containers'],
    estimatedWeight: 14.8,
    qualityScore: 0.88,
  };

  // 3. Cleanup verified event
  const verifiedEvent = auditService.createCleanupVerifiedEvent(
    cleanupId,
    userId,
    0.92,
    aiVerificationData,
    150, // EcoTokens rewarded
    'session-xyz789'
  );
  events.push(verifiedEvent);

  // 4. Tokens minted event
  const tokensMintedEvent = auditService.createTokensMintedEvent(
    userId,
    150,
    'cleanup_reward',
    '0.0.456@1234567890.123456',
    cleanupId,
    'session-xyz789'
  );
  events.push(tokensMintedEvent);

  // Log all events in batch
  const transactionIds = await auditService.logEvents(events);
  console.log(`Cleanup workflow logged with ${transactionIds.length} transactions`);
}

/**
 * Example: Creating topic for specific use case
 */
export async function createCleanupVerificationTopic(
  consensusService: HederaConsensusService
): Promise<string> {
  const topicId = await consensusService.createTopic({
    memo: 'ShebaGreen Cleanup Verification Events',
    autoRenewPeriod: 7776000, // 90 days
  });

  console.log(`Created cleanup verification topic: ${topicId}`);
  return topicId;
}

/**
 * Example: Subscribing to real-time events
 */
export async function subscribeToAuditEvents(
  consensusService: HederaConsensusService,
  topicId: string
): Promise<void> {
  const subscription = await consensusService.subscribeToTopic(topicId, (message) => {
    try {
      const event = JSON.parse(message.contents);
      
      // Process different event types
      switch (event.type) {
        case SystemEventType.USER_CREATED:
          console.log(`New user registered: ${event.data.userId}`);
          // Trigger welcome email, setup notifications, etc.
          break;
          
        case SystemEventType.CLEANUP_VERIFIED:
          console.log(`Cleanup verified: ${event.data.cleanupId}, reward: ${event.data.rewardAmount}`);
          // Update leaderboards, send notifications, etc.
          break;
          
        case SystemEventType.FRAUD_DETECTED:
          console.log(`Fraud detected for user: ${event.data.userId}, risk: ${event.data.riskScore}`);
          // Alert security team, freeze account, etc.
          break;
          
        default:
          console.log(`Received event: ${event.type}`);
      }
    } catch (error) {
      console.error('Failed to process consensus message:', error);
    }
  });

  console.log(`Subscribed to topic ${topicId}`);
  
  // Return unsubscribe function for cleanup
  return subscription.unsubscribe;
}

/**
 * Example: Fraud detection and security logging
 */
export async function handleFraudDetection(
  auditService: AuditTrailService,
  userId: string,
  suspiciousActivity: any
): Promise<void> {
  // Create fraud detection event
  const fraudEvent = auditService.createFraudDetectedEvent(
    userId,
    'DUPLICATE_CLEANUP_SUBMISSION',
    0.85, // High risk score
    'AI_IMAGE_ANALYSIS',
    [suspiciousActivity.cleanupId1, suspiciousActivity.cleanupId2],
    suspiciousActivity.sessionId
  );

  // Log to security topic (automatically routed by audit service)
  const transactionId = await auditService.logEvent(fraudEvent);
  
  console.log(`Fraud detection logged: ${transactionId}`);
  
  // Additional security measures could be triggered here
  // - Freeze user account
  // - Alert security team
  // - Require additional verification
}

/**
 * Example: System error logging
 */
export async function logSystemError(
  auditService: AuditTrailService,
  error: Error,
  context: any
): Promise<void> {
  const errorEvent = auditService.createSystemErrorEvent(
    'DATABASE_CONNECTION_FAILED',
    error.message,
    'UserService',
    'HIGH',
    error.stack,
    context.sessionId
  );

  try {
    await auditService.logEvent(errorEvent);
    console.log('System error logged to consensus service');
  } catch (loggingError) {
    // Fallback logging if consensus service is unavailable
    console.error('Failed to log to consensus service:', loggingError);
    console.error('Original error:', error);
  }
}

/**
 * Example: Querying historical audit data
 */
export async function queryAuditHistory(
  consensusService: HederaConsensusService,
  topicId: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  try {
    const messages = await consensusService.queryMessages(topicId, {
      startTime: startDate,
      endTime: endDate,
      limit: 100,
      order: 'DESC',
    });

    console.log(`Found ${messages.length} audit events in date range`);
    
    // Process messages for reporting
    const eventSummary = messages.reduce((summary, message) => {
      try {
        const event = JSON.parse(message.contents);
        summary[event.type] = (summary[event.type] || 0) + 1;
      } catch (error) {
        console.warn('Failed to parse message:', message.id);
      }
      return summary;
    }, {} as Record<string, number>);

    console.log('Event summary:', eventSummary);
  } catch (error) {
    console.error('Failed to query audit history:', error);
  }
}

/**
 * Example: Complete audit trail setup for production
 */
export async function setupProductionAuditTrail(
  configService: IConfigService
): Promise<{
  consensusService: HederaConsensusService;
  auditService: AuditTrailService;
}> {
  // Initialize services
  const consensusService = new HederaConsensusService(configService);
  const auditService = new AuditTrailService(consensusService, configService);

  // Initialize audit trail topics
  await auditService.initialize();

  console.log('Production audit trail initialized');
  console.log(`Audit topic: ${auditService.getAuditTopicId()}`);
  console.log(`Security topic: ${auditService.getSecurityTopicId()}`);

  return { consensusService, auditService };
}