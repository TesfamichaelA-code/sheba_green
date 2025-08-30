import { Router } from 'express';
import { ComplianceController } from '../controllers/compliance.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { body, query, param } from 'express-validator';

export function createComplianceRoutes(complianceController: ComplianceController): Router {
  const router = Router();

  // Apply authentication and rate limiting to all compliance routes
  router.use(authMiddleware);
  router.use(rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 })); // 100 requests per 15 minutes

  /**
   * GET /compliance/dashboard
   * Get compliance dashboard overview
   */
  router.get('/dashboard', 
    complianceController.getDashboard.bind(complianceController)
  );

  /**
   * POST /compliance/gdpr/access-request
   * Handle GDPR data subject access request
   */
  router.post('/gdpr/access-request',
    [
      body('userId').notEmpty().withMessage('User ID is required'),
      body('verificationToken').notEmpty().withMessage('Verification token is required'),
      body('reason').optional().isString().withMessage('Reason must be a string')
    ],
    validationMiddleware,
    complianceController.handleAccessRequest.bind(complianceController)
  );

  /**
   * POST /compliance/gdpr/rectification-request
   * Handle GDPR data rectification request
   */
  router.post('/gdpr/rectification-request',
    [
      body('userId').notEmpty().withMessage('User ID is required'),
      body('verificationToken').notEmpty().withMessage('Verification token is required'),
      body('corrections').isObject().withMessage('Corrections must be an object'),
      body('reason').optional().isString().withMessage('Reason must be a string')
    ],
    validationMiddleware,
    complianceController.handleRectificationRequest.bind(complianceController)
  );

  /**
   * POST /compliance/gdpr/erasure-request
   * Handle GDPR data erasure request (Right to be forgotten)
   */
  router.post('/gdpr/erasure-request',
    [
      body('userId').notEmpty().withMessage('User ID is required'),
      body('verificationToken').notEmpty().withMessage('Verification token is required'),
      body('reason').optional().isString().withMessage('Reason must be a string')
    ],
    validationMiddleware,
    complianceController.handleErasureRequest.bind(complianceController)
  );

  /**
   * POST /compliance/gdpr/portability-request
   * Handle GDPR data portability request
   */
  router.post('/gdpr/portability-request',
    [
      body('userId').notEmpty().withMessage('User ID is required'),
      body('verificationToken').notEmpty().withMessage('Verification token is required'),
      body('reason').optional().isString().withMessage('Reason must be a string')
    ],
    validationMiddleware,
    complianceController.handlePortabilityRequest.bind(complianceController)
  );

  /**
   * POST /compliance/consent/record
   * Record user consent
   */
  router.post('/consent/record',
    [
      body('userId').notEmpty().withMessage('User ID is required'),
      body('consentType').notEmpty().withMessage('Consent type is required'),
      body('granted').isBoolean().withMessage('Granted must be a boolean'),
      body('ipAddress').optional().isIP().withMessage('Invalid IP address'),
      body('userAgent').optional().isString().withMessage('User agent must be a string')
    ],
    validationMiddleware,
    complianceController.recordConsent.bind(complianceController)
  );

  /**
   * POST /compliance/consent/withdraw
   * Withdraw user consent
   */
  router.post('/consent/withdraw',
    [
      body('userId').notEmpty().withMessage('User ID is required'),
      body('consentType').notEmpty().withMessage('Consent type is required')
    ],
    validationMiddleware,
    complianceController.withdrawConsent.bind(complianceController)
  );

  /**
   * GET /compliance/audit/events
   * Query audit events
   */
  router.get('/audit/events',
    [
      query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO 8601 date'),
      query('endDate').optional().isISO8601().withMessage('End date must be valid ISO 8601 date'),
      query('eventTypes').optional().isString().withMessage('Event types must be comma-separated string'),
      query('userId').optional().isString().withMessage('User ID must be a string'),
      query('entityType').optional().isString().withMessage('Entity type must be a string'),
      query('action').optional().isString().withMessage('Action must be a string'),
      query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
      query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
    ],
    validationMiddleware,
    complianceController.queryAuditEvents.bind(complianceController)
  );

  /**
   * POST /compliance/audit/report
   * Generate audit report
   */
  router.post('/audit/report',
    [
      body('title').notEmpty().withMessage('Report title is required'),
      body('description').notEmpty().withMessage('Report description is required'),
      body('query').isObject().withMessage('Query must be an object'),
      body('query.startDate').optional().isISO8601().withMessage('Start date must be valid ISO 8601 date'),
      body('query.endDate').optional().isISO8601().withMessage('End date must be valid ISO 8601 date')
    ],
    validationMiddleware,
    complianceController.generateAuditReport.bind(complianceController)
  );

  /**
   * GET /compliance/audit/export
   * Export audit data
   */
  router.get('/audit/export',
    [
      query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO 8601 date'),
      query('endDate').optional().isISO8601().withMessage('End date must be valid ISO 8601 date'),
      query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv'),
      query('eventTypes').optional().isString().withMessage('Event types must be comma-separated string'),
      query('limit').optional().isInt({ min: 1, max: 10000 }).withMessage('Limit must be between 1 and 10000')
    ],
    validationMiddleware,
    complianceController.exportAuditData.bind(complianceController)
  );

  /**
   * GET /compliance/metrics
   * Get compliance metrics
   */
  router.get('/metrics',
    [
      query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO 8601 date'),
      query('endDate').optional().isISO8601().withMessage('End date must be valid ISO 8601 date')
    ],
    validationMiddleware,
    complianceController.getComplianceMetrics.bind(complianceController)
  );

  /**
   * GET /compliance/retention/status
   * Get data retention status
   */
  router.get('/retention/status',
    complianceController.getRetentionStatus.bind(complianceController)
  );

  /**
   * POST /compliance/retention/process-expired
   * Process expired data according to retention policies
   */
  router.post('/retention/process-expired',
    complianceController.processExpiredData.bind(complianceController)
  );

  /**
   * POST /compliance/retention/policies
   * Create new retention policy
   */
  router.post('/retention/policies',
    [
      body('name').notEmpty().withMessage('Policy name is required'),
      body('description').notEmpty().withMessage('Policy description is required'),
      body('dataType').notEmpty().withMessage('Data type is required'),
      body('retentionPeriodDays').isInt({ min: 1 }).withMessage('Retention period must be positive integer'),
      body('deletionMethod').isIn(['hard_delete', 'soft_delete', 'anonymize']).withMessage('Invalid deletion method'),
      body('legalBasis').notEmpty().withMessage('Legal basis is required'),
      body('isActive').isBoolean().withMessage('isActive must be boolean')
    ],
    validationMiddleware,
    complianceController.createRetentionPolicy.bind(complianceController)
  );

  /**
   * PUT /compliance/retention/policies/:policyId
   * Update retention policy
   */
  router.put('/retention/policies/:policyId',
    [
      param('policyId').notEmpty().withMessage('Policy ID is required'),
      body('name').optional().isString().withMessage('Policy name must be string'),
      body('description').optional().isString().withMessage('Policy description must be string'),
      body('retentionPeriodDays').optional().isInt({ min: 1 }).withMessage('Retention period must be positive integer'),
      body('deletionMethod').optional().isIn(['hard_delete', 'soft_delete', 'anonymize']).withMessage('Invalid deletion method'),
      body('legalBasis').optional().isString().withMessage('Legal basis must be string'),
      body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
    ],
    validationMiddleware,
    complianceController.updateRetentionPolicy.bind(complianceController)
  );

  return router;
}