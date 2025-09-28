import { DIDDocument, VerificationMethod, Service } from '@/types';
import { hederaService } from './hedera';
import { databaseService } from './database';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export class DIDService {
  private readonly DID_METHOD = 'hedera';
  private readonly DID_CONTEXT = 'https://www.w3.org/ns/did/v1';

  /**
   * Create a new DID for a user
   */
  async createDID(userId: string): Promise<DIDDocument> {
    try {
      // Generate a unique DID identifier
      const didId = `${this.DID_METHOD}:${uuidv4()}`;
      
      // Create Hedera account for the DID
      const { accountId, privateKey } = await hederaService.createAccount();
      
      // Generate verification method
      const verificationMethod: VerificationMethod = {
        id: `${didId}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: didId,
        publicKeyMultibase: privateKey.publicKey.toString(),
      };

      // Create DID document
      const didDocument: DIDDocument = {
        '@context': [this.DID_CONTEXT],
        id: didId,
        verificationMethod: [verificationMethod],
        authentication: [`${didId}#key-1`],
        assertionMethod: [`${didId}#key-1`],
        keyAgreement: [`${didId}#key-1`],
        capabilityInvocation: [`${didId}#key-1`],
        capabilityDelegation: [`${didId}#key-1`],
        service: [
          {
            id: `${didId}#eco-rewards-service`,
            type: 'EcoRewardsService',
            serviceEndpoint: `https://api.shebagreen.com/users/${userId}/profile`,
          },
        ],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // Store DID in database
      await databaseService.query(
        'UPDATE users SET did = $1, hedera_account_id = $2 WHERE id = $3',
        [didId, accountId.toString(), userId]
      );

      // Log DID creation to HCS
      await this.logDIDEvent('did_creation', {
        userId,
        did: didId,
        hederaAccountId: accountId.toString(),
        verificationMethod: verificationMethod.id,
      });

      logger.info(`Created DID for user ${userId}: ${didId}`);

      return didDocument;
    } catch (error) {
      logger.error('Error creating DID:', error);
      throw new Error(`Failed to create DID: ${error}`);
    }
  }

  /**
   * Resolve a DID document from Hedera network
   */
  async resolveDID(did: string): Promise<DIDDocument | null> {
    try {
      // Query database for DID document
      const result = await databaseService.query(
        'SELECT did FROM users WHERE did = $1',
        [did]
      );

      if (result.length === 0) {
        return null;
      }

      // In a real implementation, you would resolve from Hedera network
      // For now, we'll reconstruct from database
      const user = result[0];
      
      // Get user details to reconstruct DID document
      const userDetails = await databaseService.query(
        'SELECT id, first_name, last_name, hedera_account_id FROM users WHERE did = $1',
        [did]
      );

      if (userDetails.length === 0) {
        return null;
      }

      const userData = userDetails[0];
      
      // Reconstruct DID document
      const didDocument: DIDDocument = {
        '@context': [this.DID_CONTEXT],
        id: did,
        verificationMethod: [
          {
            id: `${did}#key-1`,
            type: 'Ed25519VerificationKey2020',
            controller: did,
            publicKeyMultibase: '', // Would be retrieved from Hedera
          },
        ],
        authentication: [`${did}#key-1`],
        assertionMethod: [`${did}#key-1`],
        keyAgreement: [`${did}#key-1`],
        capabilityInvocation: [`${did}#key-1`],
        capabilityDelegation: [`${did}#key-1`],
        service: [
          {
            id: `${did}#eco-rewards-service`,
            type: 'EcoRewardsService',
            serviceEndpoint: `https://api.shebagreen.com/users/${userData.id}/profile`,
          },
        ],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      return didDocument;
    } catch (error) {
      logger.error('Error resolving DID:', error);
      throw new Error(`Failed to resolve DID: ${error}`);
    }
  }

  /**
   * Update a DID document
   */
  async updateDID(did: string, updates: Partial<DIDDocument>): Promise<DIDDocument> {
    try {
      // Verify DID exists
      const existingDID = await this.resolveDID(did);
      if (!existingDID) {
        throw new Error('DID not found');
      }

      // Create updated DID document
      const updatedDID: DIDDocument = {
        ...existingDID,
        ...updates,
        updated: new Date().toISOString(),
      };

      // Log DID update to HCS
      await this.logDIDEvent('did_update', {
        did,
        updates,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Updated DID: ${did}`);

      return updatedDID;
    } catch (error) {
      logger.error('Error updating DID:', error);
      throw new Error(`Failed to update DID: ${error}`);
    }
  }

  /**
   * Add a new verification method to DID
   */
  async addVerificationMethod(
    did: string,
    verificationMethod: VerificationMethod
  ): Promise<DIDDocument> {
    try {
      const existingDID = await this.resolveDID(did);
      if (!existingDID) {
        throw new Error('DID not found');
      }

      // Add new verification method
      const updatedVerificationMethods = [
        ...existingDID.verificationMethod,
        verificationMethod,
      ];

      const updatedDID = await this.updateDID(did, {
        verificationMethod: updatedVerificationMethods,
        authentication: [
          ...existingDID.authentication,
          verificationMethod.id,
        ],
      });

      logger.info(`Added verification method to DID: ${did}`);

      return updatedDID;
    } catch (error) {
      logger.error('Error adding verification method:', error);
      throw new Error(`Failed to add verification method: ${error}`);
    }
  }

  /**
   * Add a new service to DID
   */
  async addService(did: string, service: Service): Promise<DIDDocument> {
    try {
      const existingDID = await this.resolveDID(did);
      if (!existingDID) {
        throw new Error('DID not found');
      }

      // Add new service
      const updatedServices = [...(existingDID.service || []), service];

      const updatedDID = await this.updateDID(did, {
        service: updatedServices,
      });

      logger.info(`Added service to DID: ${did}`);

      return updatedDID;
    } catch (error) {
      logger.error('Error adding service:', error);
      throw new Error(`Failed to add service: ${error}`);
    }
  }

  /**
   * Verify DID ownership
   */
  async verifyDIDOwnership(did: string, proof: any): Promise<boolean> {
    try {
      // In a real implementation, this would verify cryptographic proof
      // For now, we'll do basic validation
      
      const didDocument = await this.resolveDID(did);
      if (!didDocument) {
        return false;
      }

      // Verify proof structure
      if (!proof.type || !proof.created || !proof.verificationMethod) {
        return false;
      }

      // Log verification attempt
      await this.logDIDEvent('did_verification', {
        did,
        proof,
        verified: true,
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      logger.error('Error verifying DID ownership:', error);
      return false;
    }
  }

  /**
   * Log DID events to HCS
   */
  private async logDIDEvent(eventType: string, details: any): Promise<void> {
    try {
      // Store in audit logs
      await databaseService.query(
        'INSERT INTO audit_logs (event_type, details, timestamp) VALUES ($1, $2, NOW())',
        [eventType, JSON.stringify(details)]
      );

      // Submit to HCS topic (if configured)
      // This would be implemented when HCS topics are set up
      
      logger.debug(`Logged DID event: ${eventType}`, details);
    } catch (error) {
      logger.error('Error logging DID event:', error);
      // Don't throw error as this is logging
    }
  }

  /**
   * Get user's DID by user ID
   */
  async getUserDID(userId: string): Promise<string | null> {
    try {
      const result = await databaseService.query(
        'SELECT did FROM users WHERE id = $1',
        [userId]
      );

      return result.length > 0 ? result[0].did : null;
    } catch (error) {
      logger.error('Error getting user DID:', error);
      throw new Error(`Failed to get user DID: ${error}`);
    }
  }

  /**
   * Generate DID hash for verification
   */
  private generateDIDHash(didDocument: DIDDocument): string {
    const content = JSON.stringify(didDocument, Object.keys(didDocument).sort());
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

export const didService = new DIDService();
