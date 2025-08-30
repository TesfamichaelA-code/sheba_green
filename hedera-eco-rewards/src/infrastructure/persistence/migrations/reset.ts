import { DatabaseConnection, createDatabaseConfig } from '../database-config';
import { ConfigService } from '../../../shared/config/config.service';

async function resetDatabase() {
  try {
    const configService = new ConfigService();
    const dbConfig = createDatabaseConfig(configService);
    const db = DatabaseConnection.getInstance(dbConfig);

    console.log('Resetting database...');

    // Drop all tables in reverse order to handle foreign key constraints
    const dropQueries = [
      'DROP TABLE IF EXISTS audit_logs CASCADE;',
      'DROP TABLE IF EXISTS system_events CASCADE;',
      'DROP TABLE IF EXISTS credentials CASCADE;',
      'DROP TABLE IF EXISTS user_achievements CASCADE;',
      'DROP TABLE IF EXISTS achievements CASCADE;',
      'DROP TABLE IF EXISTS token_balances CASCADE;',
      'DROP TABLE IF EXISTS token_transactions CASCADE;',
      'DROP TABLE IF EXISTS tokens CASCADE;',
      'DROP TABLE IF EXISTS cleanups CASCADE;',
      'DROP TABLE IF EXISTS users CASCADE;',
      'DROP TABLE IF EXISTS migrations CASCADE;',
      'DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;'
    ];

    for (const query of dropQueries) {
      await db.executeQuery(query);
    }

    console.log('✓ Database reset completed successfully!');
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Database reset failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  resetDatabase();
}