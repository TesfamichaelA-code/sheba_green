import { IUserRepository, UserId, HederaDID, UserProfile } from '../../../domain/repositories/user-repository.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { User } from '../../../domain/entities/user';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { DatabaseConnection } from '../../persistence/database-config';
import { Achievement, UserStatus } from '../../../domain/entities/common-types';

interface UserRow {
  id: string;
  hedera_account_id: string;
  did: string;
  email: string;
  phone?: string;
  first_name: string;
  last_name: string;
  date_of_birth?: Date;
  location?: any;
  profile_image_url?: string;
  bio?: string;
  token_balance: string;
  total_cleanups: number;
  total_impact_score: string;
  verification_status: string;
  created_at: Date;
  updated_at: Date;
}

interface AchievementRow {
  id: string;
  user_id: string;
  achievement_id: string;
  earned_at: Date;
  achievement_name: string;
  achievement_description: string;
  achievement_category: string;
}

export class PostgreSQLUserRepository implements IUserRepository {
  constructor(private db: DatabaseConnection) {}

  async save(userAggregate: UserAggregate): Promise<void> {
    const user = this.extractUserFromAggregate(userAggregate);
    const profile = userAggregate.getProfile();
    const achievements = userAggregate.getAchievements();

    await this.db.executeTransaction(async (client) => {
      // Check if user exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE id = $1',
        [user.id]
      );

      if (existingUser.rows.length > 0) {
        // Update existing user
        await client.query(`
          UPDATE users SET
            hedera_account_id = $2,
            did = $3,
            email = $4,
            phone = $5,
            first_name = $6,
            last_name = $7,
            date_of_birth = $8,
            location = $9,
            profile_image_url = $10,
            bio = $11,
            token_balance = $12,
            total_cleanups = $13,
            total_impact_score = $14,
            verification_status = $15,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [
          user.id,
          user.hederaAccountId.toString(),
          user.did,
          profile.email,
          profile.phone,
          this.extractFirstName(profile.name),
          this.extractLastName(profile.name),
          null, // date_of_birth - would need to be added to profile
          profile.location ? JSON.stringify({ address: profile.location }) : null,
          null, // profile_image_url - would need to be added to profile
          null, // bio - would need to be added to profile
          user.getTokenBalance().getValue().toString(),
          userAggregate.getTotalCleanupCount(),
          userAggregate.getTotalWasteCollected().toString(),
          this.mapUserStatusToString(user.getStatus())
        ]);
      } else {
        // Insert new user
        await client.query(`
          INSERT INTO users (
            id, hedera_account_id, did, email, phone, first_name, last_name,
            location, token_balance, total_cleanups, total_impact_score, verification_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          user.id,
          user.hederaAccountId.toString(),
          user.did,
          profile.email,
          profile.phone,
          this.extractFirstName(profile.name),
          this.extractLastName(profile.name),
          profile.location ? JSON.stringify({ address: profile.location }) : null,
          user.getTokenBalance().getValue().toString(),
          userAggregate.getTotalCleanupCount(),
          userAggregate.getTotalWasteCollected().toString(),
          this.mapUserStatusToString(user.getStatus())
        ]);
      }

      // Save achievements
      await this.saveUserAchievements(client, user.id, achievements);
    });
  }

  async findById(id: UserId): Promise<UserAggregate | null> {
    const userRows = await this.db.executeQuery<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (userRows.length === 0) {
      return null;
    }

    return this.buildUserAggregate(userRows[0]);
  }

  async findByHederaAccountId(accountId: HederaAccountId): Promise<UserAggregate | null> {
    const userRows = await this.db.executeQuery<UserRow>(
      'SELECT * FROM users WHERE hedera_account_id = $1',
      [accountId.toString()]
    );

    if (userRows.length === 0) {
      return null;
    }

    return this.buildUserAggregate(userRows[0]);
  }

  async findByDID(did: HederaDID): Promise<UserAggregate | null> {
    const userRows = await this.db.executeQuery<UserRow>(
      'SELECT * FROM users WHERE did = $1',
      [did]
    );

    if (userRows.length === 0) {
      return null;
    }

    return this.buildUserAggregate(userRows[0]);
  }

  async findActiveUsers(limit: number, offset: number): Promise<UserAggregate[]> {
    const userRows = await this.db.executeQuery<UserRow>(
      `SELECT * FROM users 
       WHERE verification_status = 'active' 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const aggregates: UserAggregate[] = [];
    for (const row of userRows) {
      const aggregate = await this.buildUserAggregate(row);
      if (aggregate) {
        aggregates.push(aggregate);
      }
    }

    return aggregates;
  }

  async delete(id: UserId): Promise<void> {
    await this.db.executeQuery(
      'DELETE FROM users WHERE id = $1',
      [id]
    );
  }

  async exists(id: UserId): Promise<boolean> {
    const result = await this.db.executeQuery<{ count: string }>(
      'SELECT COUNT(*) as count FROM users WHERE id = $1',
      [id]
    );

    return parseInt(result[0].count) > 0;
  }

  private async buildUserAggregate(userRow: UserRow): Promise<UserAggregate> {
    // Build user profile
    const profile: UserProfile = {
      name: `${userRow.first_name} ${userRow.last_name}`,
      email: userRow.email,
      phone: userRow.phone,
      location: userRow.location?.address,
      joinedAt: userRow.created_at
    };

    // Create user entity
    const user = new User(
      userRow.id,
      new HederaAccountId(userRow.hedera_account_id),
      userRow.did,
      profile
    );

    // Set token balance
    const tokenBalance = new TokenAmount(BigInt(userRow.token_balance));
    user.setTokenBalance(tokenBalance);

    // Set user status
    const status = this.mapStringToUserStatus(userRow.verification_status);
    user.setStatus(status);

    // Load achievements
    const achievements = await this.loadUserAchievements(userRow.id);
    achievements.forEach(achievement => user.addAchievement(achievement));

    // Create aggregate (cleanup history would be loaded separately if needed)
    return UserAggregate.fromUser(user);
  }

  private async loadUserAchievements(userId: string): Promise<Achievement[]> {
    const achievementRows = await this.db.executeQuery<AchievementRow>(`
      SELECT 
        ua.id,
        ua.user_id,
        ua.achievement_id,
        ua.earned_at,
        a.name as achievement_name,
        a.description as achievement_description,
        a.category as achievement_category
      FROM user_achievements ua
      JOIN achievements a ON ua.achievement_id = a.id
      WHERE ua.user_id = $1
      ORDER BY ua.earned_at DESC
    `, [userId]);

    return achievementRows.map(row => ({
      id: row.id,
      type: this.mapCategoryToAchievementType(row.achievement_category),
      title: row.achievement_name,
      description: row.achievement_description,
      earnedAt: row.earned_at
    }));
  }

  private async saveUserAchievements(client: any, userId: string, achievements: Achievement[]): Promise<void> {
    // Remove existing achievements
    await client.query(
      'DELETE FROM user_achievements WHERE user_id = $1',
      [userId]
    );

    // Insert current achievements
    for (const achievement of achievements) {
      // Find achievement ID by name
      const achievementResult = await client.query(
        'SELECT id FROM achievements WHERE name = $1',
        [achievement.title]
      );

      if (achievementResult.rows.length > 0) {
        await client.query(`
          INSERT INTO user_achievements (user_id, achievement_id, earned_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, achievement_id) DO NOTHING
        `, [
          userId,
          achievementResult.rows[0].id,
          achievement.earnedAt
        ]);
      }
    }
  }

  private extractUserFromAggregate(aggregate: UserAggregate): User {
    // This is a simplified extraction - in a real implementation,
    // you might need to access private fields through getters
    return new User(
      aggregate.getId(),
      aggregate.getHederaAccountId(),
      aggregate.getDID(),
      aggregate.getProfile()
    );
  }

  private extractFirstName(fullName: string): string {
    return fullName.split(' ')[0] || '';
  }

  private extractLastName(fullName: string): string {
    const parts = fullName.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }

  private mapUserStatusToString(status: UserStatus): string {
    switch (status) {
      case UserStatus.ACTIVE:
        return 'active';
      case UserStatus.PENDING:
        return 'pending';
      case UserStatus.SUSPENDED:
        return 'suspended';
      case UserStatus.BANNED:
        return 'banned';
      default:
        return 'pending';
    }
  }

  private mapStringToUserStatus(status: string): UserStatus {
    switch (status) {
      case 'active':
        return UserStatus.ACTIVE;
      case 'pending':
        return UserStatus.PENDING;
      case 'suspended':
        return UserStatus.SUSPENDED;
      case 'banned':
        return UserStatus.BANNED;
      default:
        return UserStatus.PENDING;
    }
  }

  private mapCategoryToAchievementType(category: string): any {
    // This would map database categories to domain achievement types
    // Implementation depends on your specific achievement type enum
    return category;
  }
}