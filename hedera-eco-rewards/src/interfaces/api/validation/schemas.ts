import { body, param, query } from 'express-validator';

/**
 * API Validation Schemas
 * 
 * Centralized validation rules for all API endpoints using express-validator
 * Requirements: 6.2, 6.6
 */

// Common validation patterns
export const patterns = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  hederaAccountId: /^0\.0\.\d+$/,
  hederaTransactionId: /^0\.0\.\d+@\d+\.\d+$/,
  hederaTopicId: /^0\.0\.\d+$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phoneNumber: /^\+?[1-9]\d{1,14}$/,
};

// User validation schemas
export const userValidation = {
  register: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email address is required'),
    body('name')
      .isLength({ min: 2, max: 100 })
      .trim()
      .matches(/^[a-zA-Z\s\-'\.]+$/)
      .withMessage('Name must be 2-100 characters and contain only letters, spaces, hyphens, apostrophes, and periods'),
    body('phoneNumber')
      .optional()
      .matches(patterns.phoneNumber)
      .withMessage('Valid phone number is required'),
    body('location')
      .optional()
      .isObject()
      .withMessage('Location must be an object'),
    body('location.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('location.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('location.address')
      .optional()
      .isLength({ max: 200 })
      .trim()
      .withMessage('Address must not exceed 200 characters'),
  ],

  updateProfile: [
    body('name')
      .optional()
      .isLength({ min: 2, max: 100 })
      .trim()
      .matches(/^[a-zA-Z\s\-'\.]+$/)
      .withMessage('Name must be 2-100 characters and contain only letters, spaces, hyphens, apostrophes, and periods'),
    body('phoneNumber')
      .optional()
      .matches(patterns.phoneNumber)
      .withMessage('Valid phone number is required'),
    body('location')
      .optional()
      .isObject()
      .withMessage('Location must be an object'),
    body('location.latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude must be between -90 and 90'),
    body('location.longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude must be between -180 and 180'),
    body('location.address')
      .optional()
      .isLength({ max: 200 })
      .trim()
      .withMessage('Address must not exceed 200 characters'),
  ],

  getUserById: [
    param('id')
      .matches(patterns.uuid)
      .withMessage('Valid user ID is required'),
  ],

  getAchievements: [
    param('id')
      .matches(patterns.uuid)
      .withMessage('Valid user ID is required'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative'),
  ],

  getStats: [
    param('id')
      .matches(patterns.uuid)
      .withMessage('Valid user ID is required'),
  ],
};

// Cleanup validation schemas
export const cleanupValidation = {
  submit: [
    body('location')
      .isObject()
      .withMessage('Location is required'),
    body('location.latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    body('location.longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
    body('location.address')
      .optional()
      .isLength({ max: 200 })
      .trim()
      .withMessage('Address must not exceed 200 characters'),
    body('images')
      .isArray({ min: 1, max: 10 })
      .withMessage('At least 1 and at most 10 images are required'),
    body('images.*')
      .isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Each image must be a valid URL'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .trim()
      .withMessage('Description must not exceed 1000 characters'),
    body('estimatedWasteAmount')
      .optional()
      .isFloat({ min: 0, max: 10000 })
      .withMessage('Estimated waste amount must be between 0 and 10000 kg'),
    body('wasteTypes')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Waste types must be an array with at most 10 items'),
    body('wasteTypes.*')
      .optional()
      .isIn(['plastic', 'paper', 'metal', 'glass', 'organic', 'electronic', 'textile', 'hazardous', 'other'])
      .withMessage('Invalid waste type'),
  ],

  getById: [
    param('id')
      .matches(patterns.uuid)
      .withMessage('Valid cleanup ID is required'),
  ],

  getHistory: [
    query('userId')
      .optional()
      .matches(patterns.uuid)
      .withMessage('Valid user ID is required'),
    query('status')
      .optional()
      .isIn(['pending', 'verified', 'rejected'])
      .withMessage('Status must be pending, verified, or rejected'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
  ],

  getStats: [
    query('userId')
      .optional()
      .matches(patterns.uuid)
      .withMessage('Valid user ID is required'),
    query('period')
      .optional()
      .isIn(['day', 'week', 'month', 'year', 'all'])
      .withMessage('Period must be day, week, month, year, or all'),
  ],

  getNearby: [
    query('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    query('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
    query('radius')
      .optional()
      .isFloat({ min: 0.1, max: 100 })
      .withMessage('Radius must be between 0.1 and 100 km'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
  ],
};

// Token validation schemas
export const tokenValidation = {
  getBalance: [
    query('accountId')
      .optional()
      .matches(patterns.hederaAccountId)
      .withMessage('Valid Hedera account ID is required'),
  ],

  getTransactionHistory: [
    query('accountId')
      .optional()
      .matches(patterns.hederaAccountId)
      .withMessage('Valid Hedera account ID is required'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
    query('type')
      .optional()
      .isIn(['mint', 'transfer', 'burn'])
      .withMessage('Type must be mint, transfer, or burn'),
  ],

  mint: [
    body('accountId')
      .matches(patterns.hederaAccountId)
      .withMessage('Valid Hedera account ID is required'),
    body('amount')
      .isNumeric()
      .custom((value) => {
        const num = parseFloat(value);
        return num > 0 && num <= 1000000;
      })
      .withMessage('Amount must be positive and not exceed 1,000,000'),
    body('reason')
      .isLength({ min: 5, max: 500 })
      .trim()
      .withMessage('Reason must be between 5 and 500 characters'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    body('metadata.cleanupId')
      .optional()
      .matches(patterns.uuid)
      .withMessage('Cleanup ID must be a valid UUID'),
    body('metadata.verificationId')
      .optional()
      .matches(patterns.uuid)
      .withMessage('Verification ID must be a valid UUID'),
  ],

  transfer: [
    body('toAccountId')
      .matches(patterns.hederaAccountId)
      .withMessage('Valid recipient Hedera account ID is required'),
    body('amount')
      .isNumeric()
      .custom((value) => {
        const num = parseFloat(value);
        return num > 0;
      })
      .withMessage('Amount must be positive'),
    body('memo')
      .optional()
      .isLength({ max: 100 })
      .trim()
      .withMessage('Memo must not exceed 100 characters'),
  ],

  getHolders: [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative'),
    query('minBalance')
      .optional()
      .isNumeric()
      .custom((value) => parseFloat(value) >= 0)
      .withMessage('Minimum balance must be non-negative'),
  ],
};

// Audit validation schemas
export const auditValidation = {
  getTrail: [
    query('eventType')
      .optional()
      .isIn(['user_created', 'cleanup_verified', 'tokens_minted', 'credential_issued', 'user_updated'])
      .withMessage('Invalid event type'),
    query('userId')
      .optional()
      .matches(patterns.uuid)
      .withMessage('Valid user ID is required'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative'),
  ],

  getStats: [
    query('period')
      .optional()
      .isIn(['day', 'week', 'month', 'quarter', 'year', 'all'])
      .withMessage('Period must be day, week, month, quarter, year, or all'),
    query('groupBy')
      .optional()
      .isIn(['day', 'week', 'month'])
      .withMessage('Group by must be day, week, or month'),
  ],

  getImpactMetrics: [
    query('region')
      .optional()
      .isLength({ min: 2, max: 50 })
      .trim()
      .withMessage('Region must be between 2 and 50 characters'),
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
    query('aggregation')
      .optional()
      .isIn(['daily', 'weekly', 'monthly'])
      .withMessage('Aggregation must be daily, weekly, or monthly'),
  ],

  getComplianceReport: [
    query('reportType')
      .isIn(['gdpr', 'financial', 'environmental', 'full'])
      .withMessage('Report type must be gdpr, financial, environmental, or full'),
    query('startDate')
      .isISO8601()
      .withMessage('Start date is required and must be a valid ISO 8601 date'),
    query('endDate')
      .isISO8601()
      .withMessage('End date is required and must be a valid ISO 8601 date'),
    query('format')
      .optional()
      .isIn(['json', 'csv', 'pdf'])
      .withMessage('Format must be json, csv, or pdf'),
  ],

  verifyTransaction: [
    param('transactionId')
      .matches(patterns.hederaTransactionId)
      .withMessage('Valid Hedera transaction ID is required'),
  ],

  getConsensusMessages: [
    query('topicId')
      .optional()
      .matches(patterns.hederaTopicId)
      .withMessage('Valid Hedera topic ID is required'),
    query('startTime')
      .optional()
      .isISO8601()
      .withMessage('Start time must be a valid ISO 8601 date'),
    query('endTime')
      .optional()
      .isISO8601()
      .withMessage('End time must be a valid ISO 8601 date'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],

  exportData: [
    query('format')
      .isIn(['json', 'csv', 'xlsx'])
      .withMessage('Format must be json, csv, or xlsx'),
    query('startDate')
      .isISO8601()
      .withMessage('Start date is required and must be a valid ISO 8601 date'),
    query('endDate')
      .isISO8601()
      .withMessage('End date is required and must be a valid ISO 8601 date'),
    query('includePersonalData')
      .optional()
      .isBoolean()
      .withMessage('Include personal data must be boolean'),
  ],
};

// Common validation helpers
export const commonValidation = {
  pagination: [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative'),
  ],

  dateRange: [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
  ],

  uuid: (paramName: string) => [
    param(paramName)
      .matches(patterns.uuid)
      .withMessage(`Valid ${paramName} is required`),
  ],
};

// Custom validators
export const customValidators = {
  dateRangeValid: (startDate: string, endDate: string) => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      return start < end;
    }
    return true;
  },

  coordinatesValid: (latitude: number, longitude: number) => {
    return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  },

  hederaAccountIdValid: (accountId: string) => {
    return patterns.hederaAccountId.test(accountId);
  },

  phoneNumberValid: (phoneNumber: string) => {
    return patterns.phoneNumber.test(phoneNumber);
  },
};