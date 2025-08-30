import { Router } from 'express';
import { Container } from 'inversify';
import { UserController } from '../controllers/user.controller';

/**
 * User Routes
 * 
 * Defines all user-related API endpoints
 */
export const createUserRoutes = (container: Container): Router => {
  const router = Router();
  const userController = container.get<UserController>(UserController);

  // User registration
  router.post('/register', userController.register);

  // User profile management
  router.get('/profile', userController.getProfile);
  router.put('/profile', userController.updateProfile);

  // User lookup
  router.get('/:id', userController.getUserById);

  // User achievements
  router.get('/:id/achievements', userController.getAchievements);

  // User statistics
  router.get('/:id/stats', userController.getStats);

  return router;
};