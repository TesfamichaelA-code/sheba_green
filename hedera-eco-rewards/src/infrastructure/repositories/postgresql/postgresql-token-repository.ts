import {
  ITokenRepository,
  TokenId,
  TransactionId,
  TokenTransaction,
  TokenBalance
} from '../../../domain/repositories/token-repository.interface';
import { UserId } from '../../../domain/repositories/user-repository.interface';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { DatabaseConnection } from '../../persistence/database-config';

interface TokenTransactionRow {
  id: string;
  token_id: string;
  from_account_id?: string;
  to_account_id: string;
  amount: string;
  transaction_type: string;
  hedera_transaction_id: string;
  consensus_timestamp: Date;
  memo?: string;
  created_at: Date;
}

interface TokenBalanceRow {
  id: string;
  token_id: string;
  account_id: string;
  balance: string;
  last_updated: Date;
}

interface TokenRow {
  id: string;
  hedera_token_id: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
  treasury_account_id: string;
}

export class PostgreSQLTokenRepository implements ITokenRepository {
  constructor(private db: DatabaseConnection) {}

  async saveTransaction(transaction: TokenTransaction): Promise<void> {
    await this.db.executeTransaction(async (client) => {
      // Insert transaction record
      await client.query(`
        INSERT INTO token_transactions (
          id, token_id, from_account_id, to_account_id, amount,
          transaction_type, hedera_transaction_id, consensus_timestamp, memo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (hedera_transaction_id) DO NOTHING
      `, [
        transaction.id,
        transaction.tokenId || await this.getDefaultTokenId(),
        transaction.fromAccountId?.toString(),
        transaction.toAccountId.toString(),
        transaction.amount.getValue().toString(),
        transaction.type,
        transaction.id, // Using transaction ID as Hedera transaction ID for now
        transaction.timestamp,
        transaction.memo
      ]);

      // Update balances based on transaction type
      await this.updateBalancesForTransaction(client, transaction);
    });
  }

  async getBalance(accountId: HederaAccountId, tokenId: TokenId): Promise<TokenBalance | null> {
    const balanceRows = await this.db.executeQuery<TokenBalanceRow>(
      'SELECT * FROM token_balances WHERE account_id = $1 AND token_id = $2',
      [accountId.toString(), tokenId]
    );

    if (balanceRows.length === 0) {
      return null;
    }

    const row = balanceRows[0];
    return {
      accountId,
      tokenId,
      balance: new TokenAmount(BigInt(row.balance)),
      lastUpdated: row.last_updated
    };
  }

  async updateBalance(accountId: HederaAccountId, tokenId: TokenId, balance: TokenAmount): Promise<void> {
    await this.db.executeQuery(`
      INSERT INTO token_balances (token_id, account_id, balance, last_updated)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (token_id, account_id) 
      DO UPDATE SET 
        balance = EXCLUDED.balance,
        last_updated = CURRENT_TIMESTAMP
    `, [
      tokenId,
      accountId.toString(),
      balance.getValue().toString()
    ]);
  }

  async getTransactionHistory(
    accountId: HederaAccountId, 
    limit: number, 
    offset: number
  ): Promise<TokenTransaction[]> {
    const transactionRows = await this.db.executeQuery<TokenTransactionRow>(`
      SELECT tt.*, t.hedera_token_id as token_id_ref
      FROM token_transactions tt
      JOIN tokens t ON tt.token_id = t.id
      WHERE tt.from_account_id = $1 OR tt.to_account_id = $1
      ORDER BY tt.consensus_timestamp DESC
      LIMIT $2 OFFSET $3
    `, [accountId.toString(), limit, offset]);

    return transactionRows.map(row => this.mapRowToTokenTransaction(row));
  }

  async getTransaction(transactionId: TransactionId): Promise<TokenTransaction | null> {
    const transactionRows = await this.db.executeQuery<TokenTransactionRow>(`
      SELECT tt.*, t.hedera_token_id as token_id_ref
      FROM token_transactions tt
      JOIN tokens t ON tt.token_id = t.id
      WHERE tt.id = $1
    `, [transactionId]);

    if (transactionRows.length === 0) {
      return null;
    }

    return this.mapRowToTokenTransaction(transactionRows[0]);
  }

  async getTotalSupply(tokenId: TokenId): Promise<TokenAmount> {
    const tokenRows = await this.db.executeQuery<TokenRow>(
      'SELECT total_supply FROM tokens WHERE id = $1',
      [tokenId]
    );

    if (tokenRows.length === 0) {
      return new TokenAmount(0n);
    }

    return new TokenAmount(BigInt(tokenRows[0].total_supply));
  }

  async getTokenHolders(tokenId: TokenId): Promise<TokenBalance[]> {
    const balanceRows = await this.db.executeQuery<TokenBalanceRow>(
      `SELECT * FROM token_balances 
       WHERE token_id = $1 AND balance > 0 
       ORDER BY balance DESC`,
      [tokenId]
    );

    return balanceRows.map(row => ({
      accountId: new HederaAccountId(row.account_id),
      tokenId: row.token_id,
      balance: new TokenAmount(BigInt(row.balance)),
      lastUpdated: row.last_updated
    }));
  }

  async getTotalEarnedByUser(userId: UserId): Promise<TokenAmount> {
    // Get user's Hedera account ID first
    const userRows = await this.db.executeQuery<{ hedera_account_id: string }>(
      'SELECT hedera_account_id FROM users WHERE id = $1',
      [userId]
    );

    if (userRows.length === 0) {
      return new TokenAmount(0n);
    }

    const accountId = userRows[0].hedera_account_id;

    // Sum all incoming transactions (mints and transfers to this account)
    const result = await this.db.executeQuery<{ total: string }>(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM token_transactions
      WHERE to_account_id = $1 AND transaction_type IN ('MINT', 'TRANSFER')
    `, [accountId]);

    return new TokenAmount(BigInt(result[0].total || '0'));
  }

  // Helper methods

  private async getDefaultTokenId(): Promise<string> {
    const tokenRows = await this.db.executeQuery<{ id: string }>(
      'SELECT id FROM tokens WHERE symbol = $1 LIMIT 1',
      ['ECO']
    );

    if (tokenRows.length === 0) {
      throw new Error('Default EcoToken not found');
    }

    return tokenRows[0].id;
  }

  private async updateBalancesForTransaction(client: any, transaction: TokenTransaction): Promise<void> {
    const tokenId = transaction.tokenId || await this.getDefaultTokenId();

    switch (transaction.type) {
      case 'MINT':
        // Increase recipient balance
        await this.adjustBalance(
          client,
          transaction.toAccountId,
          tokenId,
          transaction.amount,
          'ADD'
        );
        break;

      case 'TRANSFER':
        if (transaction.fromAccountId) {
          // Decrease sender balance
          await this.adjustBalance(
            client,
            transaction.fromAccountId,
            tokenId,
            transaction.amount,
            'SUBTRACT'
          );
        }
        // Increase recipient balance
        await this.adjustBalance(
          client,
          transaction.toAccountId,
          tokenId,
          transaction.amount,
          'ADD'
        );
        break;

      case 'BURN':
        if (transaction.fromAccountId) {
          // Decrease account balance
          await this.adjustBalance(
            client,
            transaction.fromAccountId,
            tokenId,
            transaction.amount,
            'SUBTRACT'
          );
        }
        break;
    }
  }

  private async adjustBalance(
    client: any,
    accountId: HederaAccountId,
    tokenId: string,
    amount: TokenAmount,
    operation: 'ADD' | 'SUBTRACT'
  ): Promise<void> {
    const operator = operation === 'ADD' ? '+' : '-';
    
    await client.query(`
      INSERT INTO token_balances (token_id, account_id, balance, last_updated)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (token_id, account_id)
      DO UPDATE SET
        balance = token_balances.balance ${operator} $3,
        last_updated = CURRENT_TIMESTAMP
    `, [
      tokenId,
      accountId.toString(),
      amount.getValue().toString()
    ]);
  }

  private mapRowToTokenTransaction(row: TokenTransactionRow): TokenTransaction {
    return {
      id: row.id,
      fromAccountId: row.from_account_id ? new HederaAccountId(row.from_account_id) : undefined,
      toAccountId: new HederaAccountId(row.to_account_id),
      amount: new TokenAmount(BigInt(row.amount)),
      timestamp: row.consensus_timestamp,
      type: row.transaction_type as 'MINT' | 'TRANSFER' | 'BURN',
      memo: row.memo,
      tokenId: row.token_id
    };
  }
}