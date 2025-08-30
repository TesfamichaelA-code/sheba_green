import { injectable, inject } from 'inversify';
import { DatabaseConnection, DatabaseConfig, createDatabaseConfig } from './database-config';
import { ConfigService } from '../../shared/config/config.service';
import { TYPES } from '../../shared/container/types';

@injectable()
export class DatabaseService {
  private connection: DatabaseConnection;
  private config: DatabaseConfig;

  constructor(
    @inject(TYPES.ConfigService) private configService: ConfigService
  ) {
    this.config = createDatabaseConfig(this.configService);
    this.connection = DatabaseConnection.getInstance(this.config);
  }

  async initialize(): Promise<void> {
    const isConnected = await this.connection.testConnection();
    if (!isConnected) {
      throw new Error('Failed to initialize database connection');
    }
    console.log('Database connection initialized successfully');
  }

  getConnection(): DatabaseConnection {
    return this.connection;
  }

  async healthCheck(): Promise<boolean> {
    return this.connection.testConnection();
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  // Transaction helper methods
  async executeInTransaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    return this.connection.executeTransaction(callback);
  }

  async executeQuery<T = any>(query: string, params: any[] = []): Promise<T[]> {
    return this.connection.executeQuery<T>(query, params);
  }
}