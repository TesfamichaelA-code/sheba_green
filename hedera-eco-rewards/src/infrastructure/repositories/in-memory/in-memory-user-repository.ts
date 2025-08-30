import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { 
  IUserRepository, 
  UserId, 
  HederaDID 
} from '../../../domain/repositories/user-repository.interface';

export class InMemoryUserRepository implements IUserRepository {
  private users = new Map<UserId, UserAggregate>();

  async save(user: UserAggregate): Promise<void> {
    this.users.set(user.getId(), user);
  }

  async findById(id: UserId): Promise<UserAggregate | null> {
    return this.users.get(id) || null;
  }

  async findByHederaAccountId(accountId: HederaAccountId): Promise<UserAggregate | null> {
    for (const user of this.users.values()) {
      if (user.getHederaAccountId().equals(accountId)) {
        return user;
      }
    }
    return null;
  }

  async findByDID(did: HederaDID): Promise<UserAggregate | null> {
    for (const user of this.users.values()) {
      if (user.getDID() === did) {
        return user;
      }
    }
    return null;
  }

  async findActiveUsers(limit: number, offset: number): Promise<UserAggregate[]> {
    const allUsers = Array.from(this.users.values());
    return allUsers.slice(offset, offset + limit);
  }

  async delete(id: UserId): Promise<void> {
    this.users.delete(id);
  }

  async exists(id: UserId): Promise<boolean> {
    return this.users.has(id);
  }

  // Test helper methods
  clear(): void {
    this.users.clear();
  }

  size(): number {
    return this.users.size;
  }

  getAll(): UserAggregate[] {
    return Array.from(this.users.values());
  }
}