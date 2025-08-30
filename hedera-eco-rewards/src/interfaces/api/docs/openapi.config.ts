import swaggerJSDoc from 'swagger-jsdoc';
import { version } from '../../../../package.json';

/**
 * OpenAPI Configuration
 * 
 * Configures Swagger/OpenAPI documentation for the Hedera Eco-Rewards API
 * Requirements: 6.2, 6.6
 */

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Hedera Eco-Rewards System API',
      version,
      description: `
        A decentralized backend platform that leverages Hedera Hashgraph services to manage user identities, 
        verify cleanup activities, mint reward tokens, and maintain transparent audit trails.
        
        ## Features
        - Decentralized Identity Management (DID)
        - EcoToken Management via Hedera Token Service (HTS)
        - Cleanup Verification and Reward Distribution
        - Verifiable Credentials and Achievement System
        - Transparent Audit Trail via Consensus Service (HCS)
        
        ## Authentication
        Most endpoints require JWT authentication. Include the token in the Authorization header:
        \`Authorization: Bearer <your-jwt-token>\`
        
        ## Rate Limiting
        API requests are rate-limited to prevent abuse. Current limits:
        - 100 requests per minute for authenticated users
        - 20 requests per minute for unauthenticated users
        
        ## Error Handling
        All errors follow a consistent format with appropriate HTTP status codes and descriptive messages.
      `,
      contact: {
        name: 'ShebaGreen Team',
        email: 'support@shebagreen.com',
        url: 'https://shebagreen.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api-staging.shebagreen.com',
        description: 'Staging server',
      },
      {
        url: 'https://api.shebagreen.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from user registration or login',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for system-to-system communication',
        },
      },
      schemas: {
        // Common schemas
        Error: {
          type: 'object',
          required: ['error', 'message'],
          properties: {
            error: {
              type: 'string',
              description: 'Error code',
              example: 'VALIDATION_ERROR',
            },
            message: {
              type: 'string',
              description: 'Human-readable error message',
              example: 'Invalid input data provided',
            },
            details: {
              type: 'object',
              description: 'Additional error details',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Error timestamp',
            },
          },
        },
        SuccessResponse: {
          type: 'object',
          required: ['success', 'data', 'timestamp'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              description: 'Success message',
            },
            data: {
              type: 'object',
              description: 'Response data',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Response timestamp',
            },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: {
              type: 'integer',
              description: 'Total number of items',
              example: 150,
            },
            limit: {
              type: 'integer',
              description: 'Number of items per page',
              example: 20,
            },
            offset: {
              type: 'integer',
              description: 'Number of items to skip',
              example: 0,
            },
            hasMore: {
              type: 'boolean',
              description: 'Whether there are more items available',
              example: true,
            },
          },
        },
        // User schemas
        UserProfile: {
          type: 'object',
          required: ['id', 'hederaAccountId', 'did', 'email', 'name'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'User unique identifier',
            },
            hederaAccountId: {
              type: 'string',
              pattern: '^0\\.0\\.\\d+$',
              description: 'Hedera account ID',
              example: '0.0.123456',
            },
            did: {
              type: 'string',
              description: 'Decentralized identifier',
              example: 'did:hedera:testnet:0.0.123456',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            name: {
              type: 'string',
              description: 'User full name',
              minLength: 2,
              maxLength: 100,
            },
            phoneNumber: {
              type: 'string',
              description: 'User phone number',
            },
            location: {
              $ref: '#/components/schemas/Location',
            },
            achievements: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Achievement',
              },
            },
            totalCleanups: {
              type: 'integer',
              description: 'Total number of cleanups performed',
            },
            totalTokensEarned: {
              type: 'string',
              description: 'Total EcoTokens earned',
            },
            rank: {
              type: 'integer',
              description: 'User rank in leaderboard',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        UserRegistration: {
          type: 'object',
          required: ['email', 'name'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            name: {
              type: 'string',
              description: 'User full name',
              minLength: 2,
              maxLength: 100,
            },
            phoneNumber: {
              type: 'string',
              description: 'User phone number (optional)',
            },
            location: {
              $ref: '#/components/schemas/Location',
            },
          },
        },
        // Location schema
        Location: {
          type: 'object',
          required: ['latitude', 'longitude'],
          properties: {
            latitude: {
              type: 'number',
              minimum: -90,
              maximum: 90,
              description: 'Latitude coordinate',
            },
            longitude: {
              type: 'number',
              minimum: -180,
              maximum: 180,
              description: 'Longitude coordinate',
            },
            address: {
              type: 'string',
              description: 'Human-readable address',
            },
          },
        },
        // Cleanup schemas
        CleanupSubmission: {
          type: 'object',
          required: ['location', 'images'],
          properties: {
            location: {
              $ref: '#/components/schemas/Location',
            },
            images: {
              type: 'array',
              items: {
                type: 'string',
                format: 'uri',
              },
              minItems: 1,
              maxItems: 10,
              description: 'Array of image URLs',
            },
            description: {
              type: 'string',
              maxLength: 1000,
              description: 'Cleanup description',
            },
            estimatedWasteAmount: {
              type: 'number',
              minimum: 0,
              description: 'Estimated waste amount in kg',
            },
            wasteTypes: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['plastic', 'paper', 'metal', 'glass', 'organic', 'electronic', 'other'],
              },
              description: 'Types of waste collected',
            },
          },
        },
        Cleanup: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            userId: {
              type: 'string',
              format: 'uuid',
            },
            location: {
              $ref: '#/components/schemas/Location',
            },
            status: {
              type: 'string',
              enum: ['pending', 'verified', 'rejected'],
            },
            verificationResult: {
              $ref: '#/components/schemas/VerificationResult',
            },
            rewardAmount: {
              type: 'string',
              description: 'EcoTokens awarded',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            verifiedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        VerificationResult: {
          type: 'object',
          properties: {
            isValid: {
              type: 'boolean',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
            detectedItems: {
              type: 'object',
              additionalProperties: {
                type: 'number',
              },
            },
            fraudIndicators: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
        // Token schemas
        TokenBalance: {
          type: 'object',
          properties: {
            accountId: {
              type: 'string',
              pattern: '^0\\.0\\.\\d+$',
            },
            balance: {
              type: 'string',
              description: 'Token balance as string to handle large numbers',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        TokenMint: {
          type: 'object',
          required: ['accountId', 'amount', 'reason'],
          properties: {
            accountId: {
              type: 'string',
              pattern: '^0\\.0\\.\\d+$',
            },
            amount: {
              type: 'number',
              minimum: 0.000001,
              maximum: 1000000,
            },
            reason: {
              type: 'string',
              minLength: 5,
              maxLength: 500,
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata for the mint operation',
            },
          },
        },
        TokenTransfer: {
          type: 'object',
          required: ['toAccountId', 'amount'],
          properties: {
            toAccountId: {
              type: 'string',
              pattern: '^0\\.0\\.\\d+$',
            },
            amount: {
              type: 'number',
              minimum: 0.000001,
            },
            memo: {
              type: 'string',
              maxLength: 100,
            },
          },
        },
        // Achievement schema
        Achievement: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            type: {
              type: 'string',
              enum: ['cleanup_milestone', 'token_milestone', 'streak', 'special_event'],
            },
            title: {
              type: 'string',
            },
            description: {
              type: 'string',
            },
            credentialId: {
              type: 'string',
              description: 'Associated verifiable credential ID',
            },
            earnedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        // Audit schemas
        AuditEvent: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            eventType: {
              type: 'string',
              enum: ['user_created', 'cleanup_verified', 'tokens_minted', 'credential_issued', 'user_updated'],
            },
            userId: {
              type: 'string',
              format: 'uuid',
            },
            data: {
              type: 'object',
              description: 'Event-specific data',
            },
            transactionId: {
              type: 'string',
              description: 'Associated Hedera transaction ID',
            },
            consensusTimestamp: {
              type: 'string',
              format: 'date-time',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'Users',
        description: 'User management and profile operations',
      },
      {
        name: 'Cleanups',
        description: 'Cleanup submission and verification',
      },
      {
        name: 'Tokens',
        description: 'EcoToken operations and balance management',
      },
      {
        name: 'Audit',
        description: 'Audit trail and compliance reporting',
      },
      {
        name: 'Health',
        description: 'System health and monitoring',
      },
    ],
  },
  apis: [
    './src/interfaces/api/controllers/*.ts',
    './src/interfaces/api/routes/*.ts',
    './src/interfaces/api/docs/paths/*.yaml',
  ],
};

export const swaggerSpec = swaggerJSDoc(options);