import { Router } from 'express';
import { Container } from 'inversify';
import { CleanupController } from '../controllers/cleanup.controller';

/**
 * Cleanup Routes
 * 
 * Defines all cleanup-related API endpoints
 */
export const createCleanupRoutes = (container: Container): Router => {
  const router = Router();
  const cleanupController = container.get<CleanupController>(CleanupController);

  // Cleanup submission and management
  router.post('/', cleanupController.submitCleanup);
  router.get('/history', cleanupController.getCleanupHistory);
  router.get('/stats', cleanupController.getCleanupStats);
  router.get('/nearby', cleanupController.getNearbyCleanups);

  // Individual cleanup operations
  router.get('/:id', cleanupController.getCleanupById);
  router.get('/:id/status', cleanupController.getVerificationStatus);

  return router;
};