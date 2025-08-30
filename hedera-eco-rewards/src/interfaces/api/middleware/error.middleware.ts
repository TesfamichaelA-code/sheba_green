import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Global error handling middleware
 */
export const errorMiddleware = (
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log error for monitoring
  console.error('API Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    requestId: req.id,
    timestamp: new Date().toISOString()
  });

  // Determine status code
  const statusCode = error.statusCode || 500;
  
  // Determine error code
  const errorCode = error.code || 'INTERNAL_ERROR';

  // Don't expose internal error details in production
  const message = statusCode === 500 && process.env['NODE_ENV'] === 'production'
    ? 'Internal server error'
    : error.message;

  res.status(statusCode).json({
    error: errorCode,
    message,
    timestamp: new Date().toISOString(),
    path: req.url,
    requestId: req.id,
  });
};

/**
 * 404 Not Found middleware
 */
export const notFoundMiddleware = (req: Request, res: Response): void => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.url} not found`,
    timestamp: new Date().toISOString(),
    path: req.url,
    requestId: req.id,
  });
};