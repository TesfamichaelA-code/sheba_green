import validator from 'validator';
import { Injectable } from '../container/injectable.decorator';

export interface ISanitizationService {
  sanitizeString(input: string): string;
  sanitizeEmail(email: string): string;
  sanitizeUrl(url: string): string;
  sanitizeHtml(html: string): string;
  sanitizeJson(json: any): any;
  validateInput(input: string, type: InputType): boolean;
  escapeSQL(input: string): string;
  sanitizeFileName(fileName: string): string;
}

export enum InputType {
  EMAIL = 'email',
  URL = 'url',
  ALPHANUMERIC = 'alphanumeric',
  NUMERIC = 'numeric',
  UUID = 'uuid',
  HEDERA_ACCOUNT_ID = 'hedera_account_id',
  DID = 'did',
  JSON = 'json'
}

@Injectable()
export class InputSanitizationService implements ISanitizationService {
  private readonly maxStringLength = 10000;
  private readonly allowedFileExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.txt', '.csv'];

  sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Limit string length
    let sanitized = input.slice(0, this.maxStringLength);

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Remove control characters except newlines and tabs
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Escape HTML entities
    sanitized = validator.escape(sanitized);

    // Remove potentially dangerous patterns
    sanitized = this.removeDangerousPatterns(sanitized);

    return sanitized.trim();
  }

  sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }

    const sanitized = this.sanitizeString(email);
    return validator.isEmail(sanitized) ? validator.normalizeEmail(sanitized) || '' : '';
  }

  sanitizeUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    const sanitized = this.sanitizeString(url);
    
    // Only allow HTTP and HTTPS protocols
    if (!validator.isURL(sanitized, { 
      protocols: ['http', 'https'],
      require_protocol: true 
    })) {
      return '';
    }

    return sanitized;
  }

  sanitizeHtml(html: string): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    // Basic HTML sanitization - remove dangerous tags and attributes
    let sanitized = html;
    
    // Remove script tags and their content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove dangerous attributes
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/\s*javascript\s*:/gi, '');
    sanitized = sanitized.replace(/\s*vbscript\s*:/gi, '');
    
    // Remove dangerous tags but keep content
    sanitized = sanitized.replace(/<(iframe|object|embed|form|input|textarea|select|button)[^>]*>/gi, '');
    sanitized = sanitized.replace(/<\/(iframe|object|embed|form|input|textarea|select|button)>/gi, '');
    
    // Only allow safe tags
    const allowedTags = ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/gi;
    
    sanitized = sanitized.replace(tagRegex, (match, tagName) => {
      if (allowedTags.includes(tagName.toLowerCase())) {
        // Remove all attributes from allowed tags
        return match.replace(/\s+[a-zA-Z][a-zA-Z0-9-]*\s*=\s*["'][^"']*["']/gi, '');
      }
      return ''; // Remove disallowed tags
    });

    return sanitized;
  }

  sanitizeJson(json: any): any {
    if (json === null || json === undefined) {
      return null;
    }

    if (typeof json === 'string') {
      return this.sanitizeString(json);
    }

    if (typeof json === 'number' || typeof json === 'boolean') {
      return json;
    }

    if (Array.isArray(json)) {
      return json.map(item => this.sanitizeJson(item));
    }

    if (typeof json === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(json)) {
        const sanitizedKey = this.sanitizeString(key);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeJson(value);
        }
      }
      return sanitized;
    }

    return null;
  }

  validateInput(input: string, type: InputType): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    const sanitized = this.sanitizeString(input);

    switch (type) {
      case InputType.EMAIL:
        return validator.isEmail(sanitized);
      
      case InputType.URL:
        return validator.isURL(sanitized, { protocols: ['http', 'https'] });
      
      case InputType.ALPHANUMERIC:
        return validator.isAlphanumeric(sanitized);
      
      case InputType.NUMERIC:
        return validator.isNumeric(sanitized);
      
      case InputType.UUID:
        return validator.isUUID(sanitized);
      
      case InputType.HEDERA_ACCOUNT_ID:
        return /^0\.0\.\d+$/.test(sanitized);
      
      case InputType.DID:
        return /^did:hedera:[a-zA-Z0-9._-]+$/.test(sanitized);
      
      case InputType.JSON:
        try {
          JSON.parse(sanitized);
          return true;
        } catch {
          return false;
        }
      
      default:
        return false;
    }
  }

  escapeSQL(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Basic SQL injection prevention
    return input
      .replace(/'/g, "''")
      .replace(/;/g, '\\;')
      .replace(/--/g, '\\--')
      .replace(/\/\*/g, '\\/\\*')
      .replace(/\*\//g, '\\*\\/')
      .replace(/xp_/gi, 'x_p_')
      .replace(/sp_/gi, 's_p_');
  }

  sanitizeFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') {
      return '';
    }

    // Remove path traversal attempts
    let sanitized = fileName.replace(/\.\./g, '');
    
    // Remove or replace dangerous characters
    sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    
    // Limit length
    sanitized = sanitized.slice(0, 255);
    
    // Check file extension
    const hasValidExtension = this.allowedFileExtensions.some(ext => 
      sanitized.toLowerCase().endsWith(ext)
    );
    
    if (!hasValidExtension) {
      return '';
    }

    return sanitized;
  }

  private removeDangerousPatterns(input: string): string {
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,
      /onclick\s*=/gi,
      /onmouseover\s*=/gi,
      /eval\s*\(/gi,
      /expression\s*\(/gi,
      /url\s*\(/gi,
      /@import/gi,
      /binding\s*:/gi
    ];

    let sanitized = input;
    dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    return sanitized;
  }

  // Batch sanitization for arrays
  sanitizeArray<T>(items: T[], sanitizer: (item: T) => T): T[] {
    return items.map(item => sanitizer(item));
  }

  // Deep sanitization for nested objects
  deepSanitizeObject(obj: any, maxDepth: number = 10): any {
    if (maxDepth <= 0) {
      return null;
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitizeObject(item, maxDepth - 1));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.deepSanitizeObject(value, maxDepth - 1);
        }
      }
      return sanitized;
    }

    return null;
  }
}