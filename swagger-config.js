const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Hedera Eco-Rewards API',
      version: '1.0.0',
      description: 'A comprehensive API for the Hedera Eco-Rewards System that enables environmental cleanup verification, token rewards, and decentralized identity management.',
      contact: {
        name: 'ShebaGreen Team',
        email: 'support@shebagreen.com',
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
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique user identifier',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
            },
            firstName: {
              type: 'string',
              description: 'User first name',
            },
            lastName: {
              type: 'string',
              description: 'User last name',
            },
            phone: {
              type: 'string',
              description: 'User phone number',
            },
            location: {
              type: 'object',
              properties: {
                latitude: {
                  type: 'number',
                  format: 'double',
                },
                longitude: {
                  type: 'number',
                  format: 'double',
                },
                address: {
                  type: 'string',
                },
                city: {
                  type: 'string',
                },
                region: {
                  type: 'string',
                },
              },
            },
            hederaAccountId: {
              type: 'string',
              description: 'Hedera account ID for blockchain operations',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        CleanupActivity: {
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
              type: 'object',
              properties: {
                latitude: {
                  type: 'number',
                  format: 'double',
                },
                longitude: {
                  type: 'number',
                  format: 'double',
                },
                address: {
                  type: 'string',
                },
                city: {
                  type: 'string',
                },
                region: {
                  type: 'string',
                },
              },
            },
            description: {
              type: 'string',
              description: 'Description of the cleanup activity',
            },
            photos: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Base64 encoded photos of the cleanup',
            },
            materials: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Types of materials cleaned up',
            },
            estimatedWeight: {
              type: 'number',
              format: 'double',
              description: 'Estimated weight in kilograms',
            },
            estimatedVolume: {
              type: 'number',
              format: 'double',
              description: 'Estimated volume in liters',
            },
            verificationStatus: {
              type: 'string',
              enum: ['pending', 'verified', 'rejected'],
            },
            rewardsEarned: {
              type: 'integer',
              description: 'EcoTokens earned for this activity',
            },
            submittedAt: {
              type: 'string',
              format: 'date-time',
            },
            verifiedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        TokenBalance: {
          type: 'object',
          properties: {
            balance: {
              type: 'integer',
              description: 'EcoToken balance',
            },
            hbarBalance: {
              type: 'string',
              description: 'HBAR balance',
            },
          },
        },
        Achievement: {
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
            type: {
              type: 'string',
              enum: ['cleanup_milestone', 'education_completion', 'community_leader', 'environmental_champion'],
            },
            name: {
              type: 'string',
            },
            description: {
              type: 'string',
            },
            criteria: {
              type: 'string',
            },
            level: {
              type: 'string',
              enum: ['bronze', 'silver', 'gold', 'platinum'],
            },
            pointsRequired: {
              type: 'integer',
            },
            earnedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
              },
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
            },
            timestamp: {
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
  },
  apis: ['./server.js'], // Path to the API files
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };
