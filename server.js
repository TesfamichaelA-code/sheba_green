const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Client, AccountId, PrivateKey, AccountBalanceQuery, TokenCreateTransaction, TokenMintTransaction, TransferTransaction, Hbar, AccountCreateTransaction } = require('@hashgraph/sdk');
const { Pool } = require('pg');
const { createClient } = require('redis');
const { swaggerUi, specs } = require('./swagger-config');
require('dotenv').config();

// Configuration
const config = {
  hedera: {
    network: process.env.HEDERA_NETWORK || 'testnet',
    operatorId: process.env.HEDERA_OPERATOR_ID || '0.0.6291912',
    operatorKey: process.env.HEDERA_OPERATOR_KEY || '3030020100300706052b8104000a04220420d34a8f201964edc0ee37baea98d045ffdc7f4c180941665467bbbd4b59656d0e',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'hedera-eco-rewards-super-secret-jwt-key-2024',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/shebagreen_eco_rewards',
  },
  port: process.env.PORT || 3000,
};

// Initialize services
const app = express();
const dbPool = new Pool({ connectionString: config.database.url });
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

// Hedera client
const hederaClient = Client.forTestnet();
hederaClient.setOperator(
  AccountId.fromString(config.hedera.operatorId),
  PrivateKey.fromString(config.hedera.operatorKey)
);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Hedera Eco-Rewards API Documentation',
}));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API server
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: healthy
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: 1.0.0
 *                     hederaAccount:
 *                       type: string
 *                       example: 0.0.6291912
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date(),
      version: '1.0.0',
      hederaAccount: config.hedera.operatorId,
    },
  });
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'ACCESS_TOKEN_REQUIRED', message: 'Access token is required' },
      timestamp: new Date(),
    });
  }

  jwt.verify(token, config.jwt.secret, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
        timestamp: new Date(),
      });
    }
    req.user = user;
    next();
  });
};

// User registration
/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account and automatically creates a Hedera account for blockchain operations
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: SecurePassword123!
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               phone:
 *                 type: string
 *                 example: +251912345678
 *               location:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     format: double
 *                     example: 9.0192
 *                   longitude:
 *                     type: number
 *                     format: double
 *                     example: 38.7525
 *                   address:
 *                     type: string
 *                     example: Meskel Square, Addis Ababa
 *                   city:
 *                     type: string
 *                     example: Addis Ababa
 *                   region:
 *                     type: string
 *                     example: Addis Ababa
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userId:
 *                           type: string
 *                           format: uuid
 *                         hederaAccountId:
 *                           type: string
 *                           example: 0.0.6919273
 *                         message:
 *                           type: string
 *                           example: User registered successfully
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, location } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' },
        timestamp: new Date(),
      });
    }

    // Check if user exists
    const existingUser = await dbPool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: { code: 'USER_EXISTS', message: 'User with this email already exists' },
        timestamp: new Date(),
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    // Create user
    await dbPool.query(
      `INSERT INTO users (
        id, email, password_hash, first_name, last_name, phone, 
        location_latitude, location_longitude, location_address, 
        location_city, location_region
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        userId, email, passwordHash, firstName, lastName, phone || null,
        location?.latitude || null, location?.longitude || null,
        location?.address || null, location?.city || null, location?.region || null,
      ]
    );

    // Create Hedera account for user
    const userPrivateKey = PrivateKey.generateED25519();
    const userPublicKey = userPrivateKey.publicKey;
    
    // Create account using AccountCreateTransaction
    const accountCreateTransaction = new AccountCreateTransaction()
      .setKey(userPublicKey)
      .setInitialBalance(new Hbar(10))
      .freezeWith(hederaClient);
    
    const response = await accountCreateTransaction.execute(hederaClient);
    const receipt = await response.getReceipt(hederaClient);
    const hederaAccountId = receipt.accountId.toString();

    // Update user with Hedera account
    await dbPool.query(
      'UPDATE users SET hedera_account_id = $1 WHERE id = $2',
      [hederaAccountId, userId]
    );

    res.status(201).json({
      success: true,
      data: {
        userId,
        hederaAccountId,
        message: 'User registered successfully',
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'REGISTRATION_FAILED', message: 'Failed to register user' },
      timestamp: new Date(),
    });
  }
});

// User login
/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticates a user and returns a JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: SecurePassword123!
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *                         token:
 *                           type: string
 *                           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                         expiresIn:
 *                           type: string
 *                           example: 24h
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
        timestamp: new Date(),
      });
    }

    const userResult = await dbPool.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        timestamp: new Date(),
      });
    }

    const user = userResult.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        timestamp: new Date(),
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          hederaAccountId: user.hedera_account_id,
        },
        token,
        expiresIn: config.jwt.expiresIn,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'LOGIN_FAILED', message: 'Failed to login' },
      timestamp: new Date(),
    });
  }
});

// Get user profile
app.get('/api/v1/users/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userResult = await dbPool.query('SELECT * FROM users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        timestamp: new Date(),
      });
    }

    const user = userResult.rows[0];
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        location: {
          latitude: user.location_latitude,
          longitude: user.location_longitude,
          address: user.location_address,
          city: user.location_city,
          region: user.location_region,
        },
        hederaAccountId: user.hedera_account_id,
        createdAt: user.created_at,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'PROFILE_FETCH_FAILED', message: 'Failed to fetch user profile' },
      timestamp: new Date(),
    });
  }
});

// Submit cleanup activity
/**
 * @swagger
 * /api/v1/cleanup/submit:
 *   post:
 *     summary: Submit cleanup activity
 *     description: Submit a new cleanup activity for verification and potential rewards
 *     tags: [Cleanup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - location
 *               - description
 *             properties:
 *               location:
 *                 type: object
 *                 required:
 *                   - latitude
 *                   - longitude
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     format: double
 *                     example: 9.0192
 *                   longitude:
 *                     type: number
 *                     format: double
 *                     example: 38.7525
 *                   address:
 *                     type: string
 *                     example: Meskel Square, Addis Ababa
 *                   city:
 *                     type: string
 *                     example: Addis Ababa
 *                   region:
 *                     type: string
 *                     example: Addis Ababa
 *               description:
 *                 type: string
 *                 example: Cleaned up plastic waste from public area
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["base64-photo-1", "base64-photo-2"]
 *               materials:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["plastic", "paper"]
 *               estimatedWeight:
 *                 type: number
 *                 format: double
 *                 example: 15.5
 *               estimatedVolume:
 *                 type: number
 *                 format: double
 *                 example: 25.0
 *     responses:
 *       201:
 *         description: Cleanup activity submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         userId:
 *                           type: string
 *                           format: uuid
 *                         verificationStatus:
 *                           type: string
 *                           enum: [pending, verified, rejected]
 *                           example: pending
 *                         submittedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/v1/cleanup/submit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { location, description, photos, materials, estimatedWeight, estimatedVolume } = req.body;

    const cleanupId = uuidv4();
    
    await dbPool.query(
      `INSERT INTO cleanup_activities (
        id, user_id, location_latitude, location_longitude, location_address,
        location_city, location_region, description, photos, weight_kg,
        volume_liters, materials, verification_status, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      [
        cleanupId, userId, location.latitude, location.longitude, location.address || null,
        location.city || null, location.region || null, description, photos || [],
        estimatedWeight || null, estimatedVolume || null, materials || [], 'pending',
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: cleanupId,
        userId,
        verificationStatus: 'pending',
        submittedAt: new Date(),
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Submit cleanup error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CLEANUP_SUBMISSION_FAILED', message: 'Failed to submit cleanup activity' },
      timestamp: new Date(),
    });
  }
});

// Get token balance
/**
 * @swagger
 * /api/v1/tokens/balance:
 *   get:
 *     summary: Get user token balance
 *     description: Returns the user's EcoToken and HBAR balance from Hedera
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/TokenBalance'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/api/v1/tokens/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userResult = await dbPool.query('SELECT hedera_account_id FROM users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        timestamp: new Date(),
      });
    }

    const hederaAccountId = userResult.rows[0].hedera_account_id;
    if (!hederaAccountId) {
      return res.json({
        success: true,
        data: { balance: 0 },
        timestamp: new Date(),
      });
    }

    const balance = await new AccountBalanceQuery()
      .setAccountId(AccountId.fromString(hederaAccountId))
      .execute(hederaClient);

    // Get EcoToken balance (assuming token ID 0.0.6919248 from our test)
    const ecoTokenBalance = balance.tokens ? 
      (balance.tokens.get('0.0.6919248')?.toNumber() || 0) : 0;

    res.json({
      success: true,
      data: { 
        balance: ecoTokenBalance,
        hbarBalance: balance.hbars.toString(),
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Get token balance error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'BALANCE_FETCH_FAILED', message: 'Failed to fetch token balance' },
      timestamp: new Date(),
    });
  }
});

// Error handling
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
    timestamp: new Date(),
  });
});

app.use((error, req, res, next) => {
  console.error('API Error:', error);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An internal server error occurred' },
    timestamp: new Date(),
  });
});

// Start server
async function startServer() {
  try {
    // Connect to Redis
    await redisClient.connect();
    console.log('✅ Connected to Redis');

    // Test database connection
    await dbPool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL');

    // Start server
    app.listen(config.port, () => {
      console.log(`🚀 Hedera Eco-Rewards API server started on port ${config.port}`);
      console.log(`📋 Hedera Account: ${config.hedera.operatorId}`);
      console.log(`🌱 EcoToken ID: 0.0.6919248`);
      console.log(`🔗 Health check: http://localhost:${config.port}/health`);
      console.log(`📚 API docs: http://localhost:${config.port}/api/v1`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await redisClient.disconnect();
  await dbPool.end();
  process.exit(0);
});

startServer();
