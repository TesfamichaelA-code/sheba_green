import { DatabaseService } from '../../src/infrastructure/persistence/database.service'
import { TestDataFactory } from './test-data-factory'

export interface DatabaseFixture {
  users: any[]
  cleanups: any[]
  tokens: any[]
  achievements: any[]
}

export class DatabaseFixtures {
  private testDataFactory: TestDataFactory

  constructor(private databaseService: DatabaseService) {
    this.testDataFactory = new TestDataFactory()
  }

  async createMinimalFixture(): Promise<DatabaseFixture> {
    const users = [
      {
        id: 'user-1',
        hedera_account_id: '0.0.1001',
        did: 'did:hedera:testnet:0.0.1001',
        name: 'Test User 1',
        email: 'user1@test.com',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]

    const cleanups = [
      {
        id: 'cleanup-1',
        user_id: 'user-1',
        waste_amount: 5.5,
        area: 100.0,
        duration: 60,
        latitude: 9.0054,
        longitude: 38.7636,
        status: 'verified',
        reward_amount: 50,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]

    const tokens = [
      {
        id: 'token-1',
        hedera_token_id: '0.0.2001',
        name: 'EcoToken',
        symbol: 'ECO',
        total_supply: '1000000',
        created_at: new Date()
      }
    ]

    const achievements = [
      {
        id: 'achievement-1',
        user_id: 'user-1',
        type: 'FirstCleanupCredential',
        title: 'First Cleanup',
        description: 'Completed first cleanup activity',
        earned_at: new Date()
      }
    ]

    await this.insertFixtureData({ users, cleanups, tokens, achievements })
    
    return { users, cleanups, tokens, achievements }
  }

  async createComprehensiveFixture(): Promise<DatabaseFixture> {
    const userCount = 10
    const cleanupsPerUser = 3

    // Create users
    const users = Array.from({ length: userCount }, (_, index) => ({
      id: `user-${index + 1}`,
      hedera_account_id: `0.0.${1001 + index}`,
      did: `did:hedera:testnet:0.0.${1001 + index}`,
      name: `Test User ${index + 1}`,
      email: `user${index + 1}@test.com`,
      phone: `+251${Math.floor(Math.random() * 1000000000)}`,
      city: 'Addis Ababa',
      region: 'Addis Ababa',
      country: 'Ethiopia',
      created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      updated_at: new Date()
    }))

    // Create cleanups
    const cleanups: any[] = []
    users.forEach((user, userIndex) => {
      for (let i = 0; i < cleanupsPerUser; i++) {
        cleanups.push({
          id: `cleanup-${userIndex * cleanupsPerUser + i + 1}`,
          user_id: user.id,
          waste_amount: Math.random() * 50 + 0.5,
          area: Math.random() * 1000 + 10,
          duration: Math.floor(Math.random() * 300) + 30,
          latitude: 9.0054 + (Math.random() - 0.5) * 0.1,
          longitude: 38.7636 + (Math.random() - 0.5) * 0.1,
          status: Math.random() > 0.2 ? 'verified' : Math.random() > 0.5 ? 'pending' : 'rejected',
          reward_amount: Math.random() > 0.2 ? Math.floor(Math.random() * 100) + 10 : 0,
          created_at: new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000),
          updated_at: new Date()
        })
      }
    })

    // Create tokens
    const tokens = [
      {
        id: 'token-1',
        hedera_token_id: '0.0.2001',
        name: 'EcoToken',
        symbol: 'ECO',
        decimals: 8,
        total_supply: '1000000',
        treasury_account_id: '0.0.1000',
        created_at: new Date()
      }
    ]

    // Create achievements
    const achievements: any[] = []
    users.forEach((user, index) => {
      const userCleanups = cleanups.filter(c => c.user_id === user.id && c.status === 'verified')
      
      if (userCleanups.length > 0) {
        achievements.push({
          id: `achievement-${index + 1}-1`,
          user_id: user.id,
          type: 'FirstCleanupCredential',
          title: 'First Cleanup',
          description: 'Completed first cleanup activity',
          earned_at: userCleanups[0].created_at
        })
      }

      if (userCleanups.length >= 5) {
        achievements.push({
          id: `achievement-${index + 1}-2`,
          user_id: user.id,
          type: 'EcoWarriorCredential',
          title: 'Eco Warrior',
          description: 'Completed 5 cleanup activities',
          earned_at: new Date()
        })
      }
    })

    await this.insertFixtureData({ users, cleanups, tokens, achievements })
    
    return { users, cleanups, tokens, achievements }
  }

  async createPerformanceFixture(userCount: number = 1000): Promise<DatabaseFixture> {
    const batchSize = 100
    const users: any[] = []
    const cleanups: any[] = []
    const achievements: any[] = []

    // Create users in batches
    for (let batch = 0; batch < Math.ceil(userCount / batchSize); batch++) {
      const batchUsers = Array.from({ length: Math.min(batchSize, userCount - batch * batchSize) }, (_, index) => {
        const globalIndex = batch * batchSize + index
        return {
          id: `perf-user-${globalIndex + 1}`,
          hedera_account_id: `0.0.${10000 + globalIndex}`,
          did: `did:hedera:testnet:0.0.${10000 + globalIndex}`,
          name: `Performance User ${globalIndex + 1}`,
          email: `perfuser${globalIndex + 1}@test.com`,
          created_at: new Date(),
          updated_at: new Date()
        }
      })

      users.push(...batchUsers)

      // Create cleanups for this batch
      batchUsers.forEach((user, userIndex) => {
        const cleanupCount = Math.floor(Math.random() * 5) + 1
        for (let i = 0; i < cleanupCount; i++) {
          cleanups.push({
            id: `perf-cleanup-${user.id}-${i + 1}`,
            user_id: user.id,
            waste_amount: Math.random() * 20 + 1,
            area: Math.random() * 500 + 50,
            duration: Math.floor(Math.random() * 180) + 30,
            latitude: 9.0054,
            longitude: 38.7636,
            status: 'verified',
            reward_amount: Math.floor(Math.random() * 50) + 10,
            created_at: new Date(),
            updated_at: new Date()
          })
        }
      })
    }

    const tokens = [
      {
        id: 'perf-token-1',
        hedera_token_id: '0.0.20001',
        name: 'PerfEcoToken',
        symbol: 'PECO',
        total_supply: '10000000',
        created_at: new Date()
      }
    ]

    await this.insertFixtureData({ users, cleanups, tokens, achievements })
    
    return { users, cleanups, tokens, achievements }
  }

  async createSecurityTestFixture(): Promise<DatabaseFixture> {
    const users = [
      {
        id: 'sec-user-1',
        hedera_account_id: '0.0.9001',
        did: 'did:hedera:testnet:0.0.9001',
        name: 'Security Test User',
        email: 'security@test.com',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'sec-user-2',
        hedera_account_id: '0.0.9002',
        did: 'did:hedera:testnet:0.0.9002',
        name: 'Admin Test User',
        email: 'admin@test.com',
        role: 'admin',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]

    const cleanups = [
      {
        id: 'sec-cleanup-1',
        user_id: 'sec-user-1',
        waste_amount: 10.0,
        area: 200.0,
        duration: 120,
        latitude: 9.0054,
        longitude: 38.7636,
        status: 'verified',
        reward_amount: 100,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]

    const tokens = [
      {
        id: 'sec-token-1',
        hedera_token_id: '0.0.29001',
        name: 'SecEcoToken',
        symbol: 'SECO',
        total_supply: '100000',
        created_at: new Date()
      }
    ]

    const achievements: any[] = []

    await this.insertFixtureData({ users, cleanups, tokens, achievements })
    
    return { users, cleanups, tokens, achievements }
  }

  private async insertFixtureData(fixture: DatabaseFixture): Promise<void> {
    // Insert users
    if (fixture.users.length > 0) {
      const userColumns = Object.keys(fixture.users[0]).join(', ')
      const userValues = fixture.users.map(user => 
        `(${Object.values(user).map(v => typeof v === 'string' ? `'${v}'` : v).join(', ')})`
      ).join(', ')
      
      await this.databaseService.query(`
        INSERT INTO users (${userColumns}) VALUES ${userValues}
        ON CONFLICT (id) DO NOTHING
      `)
    }

    // Insert tokens
    if (fixture.tokens.length > 0) {
      const tokenColumns = Object.keys(fixture.tokens[0]).join(', ')
      const tokenValues = fixture.tokens.map(token => 
        `(${Object.values(token).map(v => typeof v === 'string' ? `'${v}'` : v).join(', ')})`
      ).join(', ')
      
      await this.databaseService.query(`
        INSERT INTO tokens (${tokenColumns}) VALUES ${tokenValues}
        ON CONFLICT (id) DO NOTHING
      `)
    }

    // Insert cleanups
    if (fixture.cleanups.length > 0) {
      const cleanupColumns = Object.keys(fixture.cleanups[0]).join(', ')
      const cleanupValues = fixture.cleanups.map(cleanup => 
        `(${Object.values(cleanup).map(v => typeof v === 'string' ? `'${v}'` : v).join(', ')})`
      ).join(', ')
      
      await this.databaseService.query(`
        INSERT INTO cleanups (${cleanupColumns}) VALUES ${cleanupValues}
        ON CONFLICT (id) DO NOTHING
      `)
    }

    // Insert achievements
    if (fixture.achievements.length > 0) {
      const achievementColumns = Object.keys(fixture.achievements[0]).join(', ')
      const achievementValues = fixture.achievements.map(achievement => 
        `(${Object.values(achievement).map(v => typeof v === 'string' ? `'${v}'` : v).join(', ')})`
      ).join(', ')
      
      await this.databaseService.query(`
        INSERT INTO achievements (${achievementColumns}) VALUES ${achievementValues}
        ON CONFLICT (id) DO NOTHING
      `)
    }
  }

  async clearAllFixtures(): Promise<void> {
    // Clear in reverse dependency order
    await this.databaseService.query('DELETE FROM achievements WHERE id LIKE \'%test%\' OR id LIKE \'%perf%\' OR id LIKE \'%sec%\'')
    await this.databaseService.query('DELETE FROM cleanups WHERE id LIKE \'%test%\' OR id LIKE \'%perf%\' OR id LIKE \'%sec%\'')
    await this.databaseService.query('DELETE FROM tokens WHERE id LIKE \'%test%\' OR id LIKE \'%perf%\' OR id LIKE \'%sec%\'')
    await this.databaseService.query('DELETE FROM users WHERE id LIKE \'%test%\' OR id LIKE \'%perf%\' OR id LIKE \'%sec%\'')
  }

  async getFixtureStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {}
    
    const tables = ['users', 'cleanups', 'tokens', 'achievements']
    
    for (const table of tables) {
      const result = await this.databaseService.query(`SELECT COUNT(*) as count FROM ${table}`)
      stats[table] = parseInt(result[0].count)
    }
    
    return stats
  }
}