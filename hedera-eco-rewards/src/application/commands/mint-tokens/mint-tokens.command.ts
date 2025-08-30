/**
 * Mint Tokens Command
 * 
 * Command for minting EcoTokens to user accounts.
 */

import { BaseCommand, CommandValidationError } from '../base/command.interface';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { UserId } from '../../../domain/repositories/user-repository.interface';

export class MintTokensCommand extends BaseCommand {
  constructor(
    public readonly targetUserId: UserId,
    public readonly amount: TokenAmount,
    public readonly reason: string,
    public readonly metadata?: {
      cleanupId?: string;
      achievementId?: string;
      adminUserId?: string;
      notes?: string;
    },
    userId?: string
  ) {
    super(userId);
    this.validate();
  }

  private validate(): void {
    if (!this.targetUserId) {
      throw new CommandValidationError('Target user ID is required', 'targetUserId');
    }

    if (!this.amount) {
      throw new CommandValidationError('Amount is required', 'amount');
    }

    if (this.amount.isZero() || this.amount.isNegative()) {
      throw new CommandValidationError(
        'Amount must be positive and greater than zero',
        'amount',
        this.amount.toString()
      );
    }

    if (!this.reason || this.reason.trim().length === 0) {
      throw new CommandValidationError('Reason is required', 'reason');
    }

    const validReasons = [
      'cleanup_reward',
      'bonus',
      'correction',
      'achievement',
      'admin_mint',
      'compensation'
    ];

    if (!validReasons.includes(this.reason)) {
      throw new CommandValidationError(
        `Invalid reason. Must be one of: ${validReasons.join(', ')}`,
        'reason',
        this.reason
      );
    }
  }
}

export interface MintTokensCommandResult {
  userId: UserId;
  hederaAccountId: HederaAccountId;
  amount: TokenAmount;
  newBalance: TokenAmount;
  transactionId: string;
  mintedAt: Date;
  reason: string;
}