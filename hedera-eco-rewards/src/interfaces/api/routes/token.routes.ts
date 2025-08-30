import { Router } from 'express';
import { Container } from 'inversify';
import { TokenController } from '../controllers/token.controller';

/**
 * Token Routes
 * 
 * Defines all token-related API endpoints
 */
export const createTokenRoutes = (container: Container): Router => {
  const router = Router();
  const tokenController = container.get<TokenController>(TokenController);

  // Token balance and information
  router.get('/balance', tokenController.getBalance);
  router.get('/info', tokenController.getTokenInfo);
  router.get('/supply', tokenController.getSupplyInfo);

  // Token transactions
  router.get('/transactions', tokenController.getTransactionHistory);
  router.post('/transfer', tokenController.transferTokens);

  // Administrative operations
  router.post('/mint', tokenController.mintTokens);
  router.get('/holders', tokenController.getTokenHolders);

  return router;
};