import { Router } from 'express';
import { Container } from 'inversify';
import { createUserRoutes } from './user.routes';
import { createCleanupRoutes } from './cleanup.routes';
import { createTokenRoutes } from './token.routes';
import { createAuditRoutes } from './audit.routes';

/**
 * API Routes Index
 * 
 * Combines all route modules into a single router
 */
export const createApiRoutes = (container: Container): Router => {
  const router = Router();

  // Mount route modules
  router.use('/users', createUserRoutes(container));
  router.use('/cleanups', createCleanupRoutes(container));
  router.use('/tokens', createTokenRoutes(container));
  router.use('/audit', createAuditRoutes(container));

  return router;
};