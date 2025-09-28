import { EcoToken, TokenTransferRequest, TokenTransferResponse } from '@/types';
import { hederaService } from './hedera';
import { databaseService } from './database';
import { logger } from '@/utils/logger';
import { AccountId, TokenId } from '@hashgraph/sdk';
import { v4 as uuidv4 } from 'uuid';

export class EcoTokenService {
  private ecoTokenId: TokenId | null = null;

  /**
   * Initialize EcoToken - create if not exists
   */
  async initializeEcoToken(): Promise<EcoToken> {
    try {
      // Check if EcoToken already exists in database
      const existingToken = await databaseService.query(
        'SELECT * FROM eco_tokens WHERE is_active = true LIMIT 1'
      );

      if (existingToken.length > 0) {
        const token = existingToken[0];
        this.ecoTokenId = TokenId.fromString(token.token_id);
        
        logger.info(`EcoToken already exists: ${token.token_id}`);
        
        return {
          tokenId: token.token_id,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          totalSupply: token.total_supply,
          treasuryAccountId: token.treasury_account_id,
          adminKey: token.admin_key,
          freezeKey: token.freeze_key,
          wipeKey: token.wipe_key,
          supplyKey: token.supply_key,
          kycKey: token.kyc_key,
          pauseKey: token.pause_key,
          createdAt: token.created_at,
          isActive: token.is_active,
        };
      }

      // Create new EcoToken on Hedera
      const tokenId = await hederaService.createEcoToken();
      this.ecoTokenId = tokenId;

      // Store in database
      const ecoToken: EcoToken = {
        tokenId: tokenId.toString(),
        name: 'EcoToken',
        symbol: 'ECO',
        decimals: 8,
        totalSupply: 1000000000, // 1 billion tokens
        treasuryAccountId: hederaService.getOperatorId().toString(),
        adminKey: hederaService.getOperatorKey().publicKey.toString(),
        supplyKey: hederaService.getOperatorKey().publicKey.toString(),
        freezeKey: hederaService.getOperatorKey().publicKey.toString(),
        wipeKey: hederaService.getOperatorKey().publicKey.toString(),
        kycKey: hederaService.getOperatorKey().publicKey.toString(),
        pauseKey: hederaService.getOperatorKey().publicKey.toString(),
        createdAt: new Date(),
        isActive: true,
      };

      await databaseService.query(
        `INSERT INTO eco_tokens (
          token_id, name, symbol, decimals, total_supply, treasury_account_id,
          admin_key, freeze_key, wipe_key, supply_key, kyc_key, pause_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          ecoToken.tokenId,
          ecoToken.name,
          ecoToken.symbol,
          ecoToken.decimals,
          ecoToken.totalSupply,
          ecoToken.treasuryAccountId,
          ecoToken.adminKey,
          ecoToken.freezeKey,
          ecoToken.wipeKey,
          ecoToken.supplyKey,
          ecoToken.kycKey,
          ecoToken.pauseKey,
        ]
      );

      // Log token creation
      await this.logTokenEvent('token_creation', {
        tokenId: ecoToken.tokenId,
        name: ecoToken.name,
        symbol: ecoToken.symbol,
        totalSupply: ecoToken.totalSupply,
      });

      logger.info(`Created EcoToken: ${ecoToken.tokenId}`);

      return ecoToken;
    } catch (error) {
      logger.error('Error initializing EcoToken:', error);
      throw new Error(`Failed to initialize EcoToken: ${error}`);
    }
  }

  /**
   * Mint tokens to user's account
   */
  async mintTokensToUser(userId: string, amount: number): Promise<string> {
    try {
      if (!this.ecoTokenId) {
        await this.initializeEcoToken();
      }

      // Get user's Hedera account ID
      const userResult = await databaseService.query(
        'SELECT hedera_account_id FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.length === 0) {
        throw new Error('User not found');
      }

      const hederaAccountId = userResult[0].hedera_account_id;
      if (!hederaAccountId) {
        throw new Error('User does not have Hedera account');
      }

      const accountId = AccountId.fromString(hederaAccountId);

      // Mint tokens
      const response = await hederaService.mintTokens(
        this.ecoTokenId!,
        amount,
        accountId
      );

      const transactionId = response.transactionId.toString();

      // Log token mint event
      await this.logTokenEvent('token_mint', {
        userId,
        amount,
        transactionId,
        hederaAccountId,
      });

      logger.info(`Minted ${amount} tokens to user ${userId}`);

      return transactionId;
    } catch (error) {
      logger.error('Error minting tokens to user:', error);
      throw new Error(`Failed to mint tokens: ${error}`);
    }
  }

  /**
   * Transfer tokens between users
   */
  async transferTokens(request: TokenTransferRequest): Promise<TokenTransferResponse> {
    try {
      if (!this.ecoTokenId) {
        await this.initializeEcoToken();
      }

      // Get both users' Hedera account IDs
      const fromUserResult = await databaseService.query(
        'SELECT hedera_account_id FROM users WHERE id = $1',
        [request.fromUserId]
      );

      const toUserResult = await databaseService.query(
        'SELECT hedera_account_id FROM users WHERE id = $1',
        [request.toUserId]
      );

      if (fromUserResult.length === 0 || toUserResult.length === 0) {
        throw new Error('One or both users not found');
      }

      const fromHederaAccountId = fromUserResult[0].hedera_account_id;
      const toHederaAccountId = toUserResult[0].hedera_account_id;

      if (!fromHederaAccountId || !toHederaAccountId) {
        throw new Error('One or both users do not have Hedera accounts');
      }

      const fromAccountId = AccountId.fromString(fromHederaAccountId);
      const toAccountId = AccountId.fromString(toHederaAccountId);

      // Transfer tokens
      const response = await hederaService.transferTokens(
        this.ecoTokenId!,
        fromAccountId,
        toAccountId,
        request.amount,
        request.memo
      );

      const transactionId = response.transactionId.toString();

      // Record transfer in database
      await databaseService.query(
        `INSERT INTO token_transfers (
          from_user_id, to_user_id, amount, memo, transaction_id, status
        ) VALUES ($1, $2, $3, $4, $5, 'success')`,
        [
          request.fromUserId,
          request.toUserId,
          request.amount,
          request.memo || null,
          transactionId,
        ]
      );

      // Log token transfer event
      await this.logTokenEvent('token_transfer', {
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        amount: request.amount,
        memo: request.memo,
        transactionId,
      });

      logger.info(`Transferred ${request.amount} tokens from ${request.fromUserId} to ${request.toUserId}`);

      return {
        transactionId,
        fromUserId: request.fromUserId,
        toUserId: request.toUserId,
        amount: request.amount,
        timestamp: new Date(),
        status: 'success',
      };
    } catch (error) {
      logger.error('Error transferring tokens:', error);
      
      // Record failed transfer
      await databaseService.query(
        `INSERT INTO token_transfers (
          from_user_id, to_user_id, amount, memo, transaction_id, status
        ) VALUES ($1, $2, $3, $4, $5, 'failed')`,
        [
          request.fromUserId,
          request.toUserId,
          request.amount,
          request.memo || null,
          uuidv4(), // Generate a transaction ID for failed transfers
        ]
      );

      throw new Error(`Failed to transfer tokens: ${error}`);
    }
  }

  /**
   * Get user's token balance
   */
  async getUserTokenBalance(userId: string): Promise<number> {
    try {
      const userResult = await databaseService.query(
        'SELECT hedera_account_id FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.length === 0) {
        throw new Error('User not found');
      }

      const hederaAccountId = userResult[0].hedera_account_id;
      if (!hederaAccountId) {
        return 0;
      }

      const accountId = AccountId.fromString(hederaAccountId);
      const balance = await hederaService.getAccountBalance(accountId);

      if (!this.ecoTokenId) {
        await this.initializeEcoToken();
      }

      const tokenBalance = balance.tokens.get(this.ecoTokenId!.toString()) || 0;

      return tokenBalance;
    } catch (error) {
      logger.error('Error getting user token balance:', error);
      throw new Error(`Failed to get token balance: ${error}`);
    }
  }

  /**
   * Get token information
   */
  async getTokenInfo(): Promise<EcoToken | null> {
    try {
      const result = await databaseService.query(
        'SELECT * FROM eco_tokens WHERE is_active = true LIMIT 1'
      );

      if (result.length === 0) {
        return null;
      }

      const token = result[0];
      return {
        tokenId: token.token_id,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals,
        totalSupply: token.total_supply,
        treasuryAccountId: token.treasury_account_id,
        adminKey: token.admin_key,
        freezeKey: token.freeze_key,
        wipeKey: token.wipe_key,
        supplyKey: token.supply_key,
        kycKey: token.kyc_key,
        pauseKey: token.pause_key,
        createdAt: token.created_at,
        isActive: token.is_active,
      };
    } catch (error) {
      logger.error('Error getting token info:', error);
      throw new Error(`Failed to get token info: ${error}`);
    }
  }

  /**
   * Get token transfer history for a user
   */
  async getUserTransferHistory(userId: string, limit: number = 50, offset: number = 0): Promise<any[]> {
    try {
      const result = await databaseService.query(
        `SELECT * FROM token_transfers 
         WHERE from_user_id = $1 OR to_user_id = $1 
         ORDER BY timestamp DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result;
    } catch (error) {
      logger.error('Error getting transfer history:', error);
      throw new Error(`Failed to get transfer history: ${error}`);
    }
  }

  /**
   * Calculate reward amount based on cleanup metrics
   */
  calculateRewardAmount(weightKg: number, volumeLiters: number, materials: string[]): number {
    // Base reward calculation
    let baseReward = 0;

    // Weight-based reward (1 token per kg)
    baseReward += weightKg * 1;

    // Volume-based reward (0.5 tokens per liter)
    baseReward += volumeLiters * 0.5;

    // Material multiplier
    const materialMultipliers: { [key: string]: number } = {
      plastic: 1.5,
      metal: 2.0,
      glass: 1.8,
      paper: 1.2,
      organic: 1.0,
      hazardous: 3.0,
    };

    let materialBonus = 0;
    materials.forEach((material) => {
      const multiplier = materialMultipliers[material.toLowerCase()] || 1.0;
      materialBonus += baseReward * (multiplier - 1) * 0.1;
    });

    const totalReward = Math.floor(baseReward + materialBonus);

    return Math.max(totalReward, 1); // Minimum 1 token
  }

  /**
   * Log token events to audit trail
   */
  private async logTokenEvent(eventType: string, details: any): Promise<void> {
    try {
      await databaseService.query(
        'INSERT INTO audit_logs (event_type, details, timestamp) VALUES ($1, $2, NOW())',
        [eventType, JSON.stringify(details)]
      );

      logger.debug(`Logged token event: ${eventType}`, details);
    } catch (error) {
      logger.error('Error logging token event:', error);
    }
  }
}

export const ecoTokenService = new EcoTokenService();
