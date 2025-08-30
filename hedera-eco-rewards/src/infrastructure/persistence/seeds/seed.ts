import { DatabaseConnection, createDatabaseConfig } from '../database-config';
import { ConfigService } from '../../../shared/config/config.service';

interface SeedData {
  achievements: Array<{
    name: string;
    description: string;
    category: string;
    criteria: any;
    reward_amount: number;
    badge_image_url?: string;
  }>;
  tokens: Array<{
    hedera_token_id: string;
    name: string;
    symbol: string;
    decimals: number;
    treasury_account_id: string;
  }>;
}

const seedData: SeedData = {
  achievements: [
    {
      name: 'First Cleanup',
      description: 'Complete your first environmental cleanup activity',
      category: 'milestone',
      criteria: { cleanup_count: 1 },
      reward_amount: 100000000, // 1 EcoToken (8 decimals)
      badge_image_url: 'https://example.com/badges/first-cleanup.png'
    },
    {
      name: 'Cleanup Champion',
      description: 'Complete 10 cleanup activities',
      category: 'milestone',
      criteria: { cleanup_count: 10 },
      reward_amount: 1000000000, // 10 EcoTokens
      badge_image_url: 'https://example.com/badges/cleanup-champion.png'
    },
    {
      name: 'Eco Warrior',
      description: 'Complete 50 cleanup activities',
      category: 'milestone',
      criteria: { cleanup_count: 50 },
      reward_amount: 5000000000, // 50 EcoTokens
      badge_image_url: 'https://example.com/badges/eco-warrior.png'
    },
    {
      name: 'Plastic Buster',
      description: 'Clean up 100kg of plastic waste',
      category: 'impact',
      criteria: { waste_type: 'plastic', total_amount: 100 },
      reward_amount: 2000000000, // 20 EcoTokens
      badge_image_url: 'https://example.com/badges/plastic-buster.png'
    },
    {
      name: 'Community Leader',
      description: 'Organize 5 community cleanup events',
      category: 'leadership',
      criteria: { organized_events: 5 },
      reward_amount: 3000000000, // 30 EcoTokens
      badge_image_url: 'https://example.com/badges/community-leader.png'
    },
    {
      name: 'Consistency King',
      description: 'Complete cleanups for 30 consecutive days',
      category: 'consistency',
      criteria: { consecutive_days: 30 },
      reward_amount: 2500000000, // 25 EcoTokens
      badge_image_url: 'https://example.com/badges/consistency-king.png'
    }
  ],
  tokens: [
    {
      hedera_token_id: '0.0.123456', // Placeholder - will be replaced with actual token ID
      name: 'EcoToken',
      symbol: 'ECO',
      decimals: 8,
      treasury_account_id: '0.0.123457' // Placeholder treasury account
    }
  ]
};

class DatabaseSeeder {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async seedAchievements(): Promise<void> {
    console.log('Seeding achievements...');
    
    for (const achievement of seedData.achievements) {
      await this.db.executeQuery(
        `INSERT INTO achievements (name, description, category, criteria, reward_amount, badge_image_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO NOTHING`,
        [
          achievement.name,
          achievement.description,
          achievement.category,
          JSON.stringify(achievement.criteria),
          achievement.reward_amount,
          achievement.badge_image_url
        ]
      );
    }
    
    console.log(`✓ Seeded ${seedData.achievements.length} achievements`);
  }

  async seedTokens(): Promise<void> {
    console.log('Seeding tokens...');
    
    for (const token of seedData.tokens) {
      await this.db.executeQuery(
        `INSERT INTO tokens (hedera_token_id, name, symbol, decimals, treasury_account_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (hedera_token_id) DO NOTHING`,
        [
          token.hedera_token_id,
          token.name,
          token.symbol,
          token.decimals,
          token.treasury_account_id
        ]
      );
    }
    
    console.log(`✓ Seeded ${seedData.tokens.length} tokens`);
  }

  async seedTestUsers(): Promise<void> {
    console.log('Seeding test users...');
    
    const testUsers = [
      {
        hedera_account_id: '0.0.100001',
        did: 'did:hedera:testnet:0.0.100001',
        email: 'test1@example.com',
        first_name: 'John',
        last_name: 'Doe',
        phone: '+251911123456'
      },
      {
        hedera_account_id: '0.0.100002',
        did: 'did:hedera:testnet:0.0.100002',
        email: 'test2@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+251911123457'
      }
    ];

    for (const user of testUsers) {
      await this.db.executeQuery(
        `INSERT INTO users (hedera_account_id, did, email, first_name, last_name, phone)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (hedera_account_id) DO NOTHING`,
        [
          user.hedera_account_id,
          user.did,
          user.email,
          user.first_name,
          user.last_name,
          user.phone
        ]
      );
    }
    
    console.log(`✓ Seeded ${testUsers.length} test users`);
  }

  async runSeeds(): Promise<void> {
    console.log('Starting database seeding...');
    
    await this.seedTokens();
    await this.seedAchievements();
    await this.seedTestUsers();
    
    console.log('Database seeding completed successfully!');
  }
}

// CLI execution
async function main() {
  try {
    const configService = new ConfigService();
    const dbConfig = createDatabaseConfig(configService);
    const db = DatabaseConnection.getInstance(dbConfig);

    // Test connection
    const isConnected = await db.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }

    const seeder = new DatabaseSeeder(db);
    await seeder.runSeeds();

    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { DatabaseSeeder };