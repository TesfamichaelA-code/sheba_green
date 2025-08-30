import { Pool, PoolConfig } from 'pg';
import { ConfigService } from '../../shared/config/config.service';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool;
  private config: DatabaseConfig;

  private constructor(config: DatabaseConfig) {
    this.config = config;
    this.pool = this.createPool();
  }

  public static getInstance(config?: DatabaseConfig): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      if (!config) {
        throw new Error('Database configuration required for first initialization');
      }
      DatabaseConnection.instance = new DatabaseConnection(config);
    }
    return DatabaseConnection.instance;
  }

  private createPool(): Pool {
    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: this.config.maxConnections,
      idleTimeoutMillis: this.config.idleTimeoutMillis,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis,
    };

    return new Pool(poolConfig);
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async executeQuery<T = any>(
    query: string,
    params: any[] = []
  ): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  public async executeTransaction<T>(
    callback: (client: any) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createDatabaseConfig(configService: ConfigService): DatabaseConfig {
  return {
    host: configService.get('DB_HOST', 'localhost'),
    port: configService.getNumber('DB_PORT', 5432),
    database: configService.get('DB_NAME', 'hedera_eco_rewards'),
    username: configService.get('DB_USERNAME', 'postgres'),
    password: configService.get('DB_PASSWORD', 'password'),
    ssl: configService.getBoolean('DB_SSL', false),
    maxConnections: configService.getNumber('DB_MAX_CONNECTIONS', 20),
    idleTimeoutMillis: configService.getNumber('DB_IDLE_TIMEOUT', 30000),
    connectionTimeoutMillis: configService.getNumber('DB_CONNECTION_TIMEOUT', 2000),
  };
}