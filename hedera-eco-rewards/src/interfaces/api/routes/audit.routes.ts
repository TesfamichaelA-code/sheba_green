import { Router } from 'express';
import { Container } from 'inversify';
import { AuditController } from '../controllers/audit.controller';

/**
 * Audit Routes
 * 
 * Defines all audit and reporting API endpoints
 */
export const createAuditRoutes = (container: Container): Router => {
  const router = Router();
  const auditController = container.get<AuditController>(AuditController);

  // Audit trail and logging
  router.get('/trail', auditController.getAuditTrail);
  router.get('/consensus', auditController.getConsensusMessages);

  // System reporting
  router.get('/stats', auditController.getSystemStats);
  router.get('/impact', auditController.getImpactMetrics);
  router.get('/compliance', auditController.getComplianceReport);

  // Transaction verification
  router.get('/verify/:transactionId', auditController.verifyTransaction);

  // Data export
  router.post('/export', auditController.exportAuditData);

  return router;
};