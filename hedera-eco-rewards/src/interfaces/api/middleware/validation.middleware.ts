import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain, ValidationError } from 'express-validator';

/**
 * Enhanced Validation Middleware
 * 
 * Provides comprehensive request/response validation using express-validator
 * Requirements: 6.2, 6.6
 */

export interface ValidationErrorResponse {
  error: string;
  message: string;
  details: FormattedValidationError[];
  timestamp: string;
  path: string;
  method: string;
}

export interface FormattedValidationError {
  field: string;
  message: string;
  value?: any;
  location?: string;
}

/**
 * Formats validation errors into a consistent structure
 */
const formatValidationError = (error: ValidationError): FormattedValidationError => {
  if (error.type === 'field') {
    return {
      field: error.path,
      message: error.msg,
      value: error.value,
      location: error.location,
    };
  }
  
  return {
    field: 'unknown',
    message: error.msg,
  };
};

/**
 * Handles validation errors and sends formatted response
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(formatValidationError);

    const errorResponse: ValidationErrorResponse = {
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: formattedErrors,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
    };

    res.status(400).json(errorResponse);
    return;
  }
  
  next();
};

/**
 * Main validation middleware factory
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Run all validations in parallel
      await Promise.all(validations.map(validation => validation.run(req)));
      
      // Check for validation errors
      handleValidationErrors(req, res, next);
    } catch (error) {
      // Handle unexpected validation errors
      res.status(500).json({
        error: 'VALIDATION_SYSTEM_ERROR',
        message: 'An error occurred during request validation',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
      });
    }
  };
};

/**
 * API versioning middleware
 */
export const apiVersion = (supportedVersions: string[] = ['v1']) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const version = req.headers['api-version'] as string || 
                   req.query.version as string || 
                   extractVersionFromPath(req.path) || 
                   'v1';

    if (!supportedVersions.includes(version)) {
      res.status(400).json({
        error: 'UNSUPPORTED_API_VERSION',
        message: `API version '${version}' is not supported`,
        supportedVersions,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Add version to request for use in controllers
    (req as any).apiVersion = version;
    
    // Add version to response headers
    res.setHeader('API-Version', version);
    
    next();
  };
};

/**
 * Extract version from URL path (e.g., /api/v1/users -> v1)
 */
const extractVersionFromPath = (path: string): string | null => {
  const versionMatch = path.match(/\/api\/(v\d+)\//);
  return versionMatch ? versionMatch[1] : null;
};

/**
 * Backward compatibility middleware
 */
export const backwardCompatibility = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const version = (req as any).apiVersion || 'v1';
    
    // Add compatibility transformations based on version
    switch (version) {
      case 'v1':
        // Current version - no transformations needed
        break;
      default:
        // Future versions would have transformations here
        break;
    }
    
    next();
  };
};

/**
 * Response validation middleware (for development/testing)
 */
export const validateResponse = (schema?: any) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'development' && schema) {
      // Store original json method
      const originalJson = res.json;
      
      // Override json method to validate response
      res.json = function(body: any) {
        try {
          // In a real implementation, you would validate against the schema here
          // For now, we'll just log the response structure
          console.log(`Response validation for ${req.method} ${req.path}:`, {
            status: res.statusCode,
            bodyType: typeof body,
            hasData: body && typeof body === 'object' && 'data' in body,
          });
        } catch (error) {
          console.warn('Response validation failed:', error);
        }
        
        // Call original json method
        return originalJson.call(this, body);
      };
    }
    
    next();
  };
};