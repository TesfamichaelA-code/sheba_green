import { readFileSync } from 'fs';
import { join } from 'path';
import { DatabaseConnection, createDatabaseConfig } from '../database-config';
import { ConfigService } from '../../../shared/config/config.service';

interface Migration {
  id: number;
  name: string;
  filename: string;
}

const migrations: Migration[] = [
  { id: 1, name: 'create_users_table', filename: '001_create_users_table.sql' },
  { id: 2, name: 'create_cleanups_table', filename: '002_create_cleanups_table.sql' },
  { id: 3, name: 'create_tokens_table', filename: '003_create_tokens_table.sql' },
  { id: 4, name: 'create_achievements_table', filename: '004_create_achievements_table.sql' },
  { id: 5, name: 'create_audit_logs_table', filename: '005_create_audit_logs_table.sql' },
];

class MigrationRunner {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await this.db.executeQuery(query);
  }

  async getExecutedMigrations(): Promise<number[]> {
    const result = await this.db.executeQuery<{ id: number }>(
      'SELECT id FROM migrations ORDER BY id'
    );
    return result.map(row => row.id);
  }

  async executeMigration(migration: Migration): Promise<void> {
    const migrationPath = join(__dirname, migration.filename);
    const sql = readFileSync(migrationPath, 'utf8');

    await this.db.executeTransaction(async (client) => {
      // Execute the migration SQL
      await client.query(sql);
      
      // Record the migration as executed
      await client.query(
        'INSERT INTO migrations (id, name) VALUES ($1, $2)',
        [migration.id, migration.name]
      );
    });

    console.log(`✓ Executed migration: ${migration.name}`);
  }

  async runMigrations(): Promise<void> {
    console.log('Starting database migrations...');

    await this.createMigrationsTable();
    const executedMigrations = await this.getExecutedMigrations();

    const pendingMigrations = migrations.filter(
      migration => !executedMigrations.includes(migration.id)
    );

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migrations.`);

    for (const migration of pendingMigrations) {
      try {
        await this.executeMigration(migration);
      } catch (error) {
        console.error(`✗ Failed to execute migration ${migration.name}:`, error);
        throw error;
      }
    }

    console.log('All migrations completed successfully!');
  }

  async rollbackMigration(migrationId: number): Promise<void> {
    await this.db.executeTransaction(async (client) => {
      await client.query('DELETE FROM migrations WHERE id = $1', [migrationId]);
    });
    console.log(`✓ Rolled back migration ID: ${migrationId}`);
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

    const runner = new MigrationRunner(db);
    await runner.runMigrations();

    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { MigrationRunner };