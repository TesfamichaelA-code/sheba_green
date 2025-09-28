import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  hedera: {
    network: 'testnet' | 'mainnet';
    operatorId: string;
    operatorKey: string;
  };
  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    url: string;
    host: string;
    port: number;
    password?: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  api: {
    port: number;
    nodeEnv: string;
    version: string;
  };
  security: {
    bcryptRounds: number;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
  };
  ecotoken: {
    name: string;
    symbol: string;
    decimals: number;
    initialSupply: number;
  };
  ai: {
    serviceUrl: string;
    apiKey: string;
  };
  logging: {
    level: string;
    file: string;
  };
  upload: {
    maxFileSize: number;
    path: string;
  };
  cors: {
    origin: string;
    credentials: boolean;
  };
}

const config: Config = {
  hedera: {
    network: (process.env.HEDERA_NETWORK as 'testnet' | 'mainnet') || 'testnet',
    operatorId: process.env.HEDERA_OPERATOR_ID || '',
    operatorKey: process.env.HEDERA_OPERATOR_KEY || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'hedera_eco_rewards',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  api: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    version: process.env.API_VERSION || 'v1',
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  ecotoken: {
    name: process.env.ECOTOKEN_NAME || 'EcoToken',
    symbol: process.env.ECOTOKEN_SYMBOL || 'ECO',
    decimals: parseInt(process.env.ECOTOKEN_DECIMALS || '8', 10),
    initialSupply: parseInt(process.env.ECOTOKEN_INITIAL_SUPPLY || '1000000000', 10),
  },
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL || '',
    apiKey: process.env.AI_SERVICE_API_KEY || '',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
    path: process.env.UPLOAD_PATH || 'uploads/',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },
};

export default config;
