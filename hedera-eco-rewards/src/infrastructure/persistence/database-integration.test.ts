import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DatabaseConnection, createDatabaseConfig } from './database-config';
import { ConfigService } from '../../shared/config/config.service';
import { MigrationRunner } from './migrations/migrate';
import { DatabaseSeeder } from './seeds/seed';

describe('Database Integration Tests', () => {
  let db: DatabaseConnection;
  let configService: ConfigService;

  beforeAll(async () => {
    // Setup test database
    configService = new ConfigService();
    const dbConfig = createDatabaseConfig(configService);
    
    // Use test database
    dbConfig.database = 'hedera_eco_rewards_test';
    
    db = DatabaseConnection.getInstance(dbConfig);
    
    // Test connection
    const isConnected = await db.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to test database');
    }

    // Run migrations
    const migrationRunner = new MigrationRunner(db);
    await migrationRunner.runMigrations();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.executeQuery('DELETE FROM audit_logs');
    await db.executeQuery('DELETE FROM system_events');
    await db.executeQuery('DELETE FROM credentials');
    await db.executeQuery('DELETE FROM user_achievements');
    await db.executeQuery('DELETE FROM token_balances');
    await db.executeQuery('DELETE FROM token_transactions');
    await db.executeQuery('DELETE FROM cleanups');
    await db.executeQuery('DELETE FROM users');
    await db.executeQuery('DELETE FROM achievements');
    await db.executeQuery('DELETE FROM tokens');
  });

  describe('Database Connection', () => {
    it('should establish connection successfully', async () => {
      const isConnected = await db.testConnection();
      expect(isConnected).toBe(true);
    });

    it('should execute simple queries', async () => {
      const result = await db.executeQuery('SELECT 1 as test');
      expect(result).toHaveLength(1);
      expect(result[0].test).toBe(1);
    });

    it('should handle parameterized queries', async () => {
      const result = await db.executeQuery('SELECT $1 as value', ['test']);
      expect(result[0].value).toBe('test');
    });
  });

  describe('Transaction Support', () => {
    it('should commit successful transactions', async () => {
      await db.executeTransaction(async (client) => {
        await client.query(`
          INSERT INTO users (id, hedera_account_id, did, email, first_name, last_name)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['test-user', '0.0.123456', 'did:test', 'test@example.com', 'Test', 'User']);
      });

      const users = await db.executeQuery('SELECT * FROM users WHERE id = $1', ['test-user']);
      expect(users).toHaveLength(1);
    });

    it('should rollback failed transactions', async () => {
      try {
        await db.executeTransaction(async (client) => {
          await client.query(`
            INSERT INTO users (id, hedera_account_id, did, email, first_name, last_name)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, ['test-user', '0.0.123456', 'did:test', 'test@example.com', 'Test', 'User']);
          
          // This should fail due to duplicate key
          await client.query(`
            INSERT INTO users (id, hedera_account_id, did, email, first_name, last_name)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, ['test-user', '0.0.123456', 'did:test', 'test@example.com', 'Test', 'User']);
        });
      } catch (error) {
        // Expected to fail
      }

      const users = await db.executeQuery('SELECT * FROM users WHERE id = $1', ['test-user']);
      expect(users).toHaveLength(0);
    });
  });

  describe('Schema Validation', () => {
    it('should have all required tables', async () => {
      const tables = await db.executeQuery(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

      const tableNames = tables.map(t => t.table_name);
      
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('cleanups');
      expect(tableNames).toContain('tokens');
      expect(tableNames).toContain('token_transactions');
      expect(tableNames).toContain('token_balances');
      expect(tableNames).toContain('achievements');
      expect(tableNames).toContain('user_achievements');
      expect(tableNames).toContain('credentials');
      expect(tableNames).toContain('audit_logs');
      expect(tableNames).toContain('system_events');
      expect(tableNames).toContain('migrations');
    });

    it('should have proper indexes', async () => {
      const indexes = await db.executeQuery(`
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
        ORDER BY tablename, indexname
      `);

      const indexNames = indexes.map(i => i.indexname);
      
      // Check for key performance indexes
      expect(indexNames).toContain('idx_users_hedera_account_id');
      expect(indexNames).toContain('idx_users_did');
      expect(indexNames).toContain('idx_cleanups_user_id');
      expect(indexNames).toContain('idx_cleanups_verification_status');
      expect(indexNames).toContain('idx_token_transactions_to_account');
    });

    it('should have proper foreign key constraints', async () => {
      const constraints = await db.executeQuery(`
        SELECT 
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.table_name, tc.constraint_name
      `);

      expect(constraints.length).toBeGreaterThan(0);
      
      // Check specific foreign keys
      const cleanupUserFK = constraints.find(c => 
        c.table_name === 'cleanups' && c.foreign_table_name === 'users'
      );
      expect(cleanupUserFK).toBeDefined();
    });
  });

  describe('Data Seeding', () => {
    it('should seed initial data successfully', async () => {
      const seeder = new DatabaseSeeder(db);
      await seeder.runSeeds();

      // Check that achievements were seeded
      const achievements = await db.executeQuery('SELECT * FROM achievements');
      expect(achievements.length).toBeGreaterThan(0);

      // Check that tokens were seeded
      const tokens = await db.executeQuery('SELECT * FROM tokens');
      expect(tokens.length).toBeGreaterThan(0);

      // Check that test users were seeded
      const users = await db.executeQuery('SELECT * FROM users');
      expect(users.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent connections', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(
          db.executeQuery('SELECT $1 as connection_id', [i])
        );
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      
      results.forEach((result, index) => {
        expect(result[0].connection_id).toBe(index);
      });
    });

    it('should handle large result sets efficiently', async () => {
      // Insert test data
      const insertPromises = [];
      for (let i = 0; i < 100; i++) {
        insertPromises.push(
          db.executeQuery(`
            INSERT INTO users (id, hedera_account_id, did, email, first_name, last_name)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            `user-${i}`,
            `0.0.${100000 + i}`,
            `did:hedera:testnet:0.0.${100000 + i}`,
            `user${i}@example.com`,
            `User`,
            `${i}`
          ])
        );
      }

      await Promise.all(insertPromises);

      // Query all users
      const startTime = Date.now();
      const users = await db.executeQuery('SELECT * FROM users ORDER BY id');
      const endTime = Date.now();

      expect(users).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid queries gracefully', async () => {
      await expect(
        db.executeQuery('SELECT * FROM non_existent_table')
      ).rejects.toThrow();
    });

    it('should handle constraint violations', async () => {
      // Insert a user
      await db.executeQuery(`
        INSERT INTO users (id, hedera_account_id, did, email, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['test-user', '0.0.123456', 'did:test', 'test@example.com', 'Test', 'User']);

      // Try to insert duplicate
      await expect(
        db.executeQuery(`
          INSERT INTO users (id, hedera_account_id, did, email, first_name, last_name)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['test-user', '0.0.123456', 'did:test', 'test@example.com', 'Test', 'User'])
      ).rejects.toThrow();
    });
  });
});