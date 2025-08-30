import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IConfigService } from '@shared/config/config.interface';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    hederaAccountId: string;
    did: string;
    role: string;
  };
}

/**
 * Authentication middleware factory
 */
export const authMiddleware = (configService: IConfigService) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header'
        });
        return;
      }

      const token = authHeader.substring(7);
      const config = configService.getConfig();
      const jwtSecret = config.security.jwtSecret;
      
      if (!jwtSecret) {
        throw new Error('JWT_SECRET not configured');
      }

      const decoded = jwt.verify(token, jwtSecret) as any;
      
      req.user = {
        id: decoded.sub,
        hederaAccountId: decoded.hederaAccountId,
        did: decoded.did,
        role: decoded.role || 'user'
      };

      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          error: 'INVALID_TOKEN',
          message: 'Invalid or expired token'
        });
        return;
      }
      
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Authentication error'
      });
    }
  };
};

/**
 * Authorization middleware factory
 */
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};