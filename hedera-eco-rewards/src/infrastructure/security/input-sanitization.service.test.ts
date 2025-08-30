import { describe, it, expect, beforeEach } from 'vitest';
import { InputSanitizationService, InputType } from './input-sanitization.service';

describe('InputSanitizationService', () => {
  let sanitizer: InputSanitizationService;

  beforeEach(() => {
    sanitizer = new InputSanitizationService();
  });

  describe('sanitizeString', () => {
    it('should sanitize basic string', () => {
      const input = 'Hello World';
      const result = sanitizer.sanitizeString(input);
      expect(result).toBe('Hello World');
    });

    it('should remove null bytes', () => {
      const input = 'Hello\x00World';
      const result = sanitizer.sanitizeString(input);
      expect(result).toBe('HelloWorld');
    });

    it('should remove control characters', () => {
      const input = 'Hello\x01\x02World';
      const result = sanitizer.sanitizeString(input);
      expect(result).toBe('HelloWorld');
    });

    it('should escape HTML entities', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizer.sanitizeString(input);
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;');
    });

    it('should limit string length', () => {
      const input = 'a'.repeat(20000);
      const result = sanitizer.sanitizeString(input);
      expect(result.length).toBeLessThanOrEqual(10000);
    });

    it('should handle null and undefined', () => {
      expect(sanitizer.sanitizeString(null as any)).toBe('');
      expect(sanitizer.sanitizeString(undefined as any)).toBe('');
    });

    it('should handle non-string input', () => {
      expect(sanitizer.sanitizeString(123 as any)).toBe('');
      expect(sanitizer.sanitizeString({} as any)).toBe('');
    });
  });

  describe('sanitizeEmail', () => {
    it('should sanitize valid email', () => {
      const email = 'test@example.com';
      const result = sanitizer.sanitizeEmail(email);
      expect(result).toBe('test@example.com');
    });

    it('should normalize email', () => {
      const email = 'Test+Tag@EXAMPLE.COM';
      const result = sanitizer.sanitizeEmail(email);
      expect(result).toBe('test+tag@example.com');
    });

    it('should reject invalid email', () => {
      const email = 'invalid-email';
      const result = sanitizer.sanitizeEmail(email);
      expect(result).toBe('');
    });

    it('should handle malicious email input', () => {
      const email = '<script>alert("xss")</script>@example.com';
      const result = sanitizer.sanitizeEmail(email);
      expect(result).toBe('');
    });
  });

  describe('sanitizeUrl', () => {
    it('should sanitize valid HTTP URL', () => {
      const url = 'http://example.com';
      const result = sanitizer.sanitizeUrl(url);
      expect(result).toBe('http://example.com');
    });

    it('should sanitize valid HTTPS URL', () => {
      const url = 'https://example.com';
      const result = sanitizer.sanitizeUrl(url);
      expect(result).toBe('https://example.com');
    });

    it('should reject non-HTTP protocols', () => {
      const url = 'javascript:alert("xss")';
      const result = sanitizer.sanitizeUrl(url);
      expect(result).toBe('');
    });

    it('should reject invalid URLs', () => {
      const url = 'not-a-url';
      const result = sanitizer.sanitizeUrl(url);
      expect(result).toBe('');
    });
  });

  describe('sanitizeHtml', () => {
    it('should allow safe HTML tags', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const result = sanitizer.sanitizeHtml(html);
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
    });

    it('should remove dangerous HTML tags', () => {
      const html = '<script>alert("xss")</script><p>Safe content</p>';
      const result = sanitizer.sanitizeHtml(html);
      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>');
    });

    it('should remove all attributes', () => {
      const html = '<p onclick="alert(\'xss\')">Content</p>';
      const result = sanitizer.sanitizeHtml(html);
      expect(result).not.toContain('onclick');
      expect(result).toContain('<p>');
    });
  });

  describe('sanitizeJson', () => {
    it('should sanitize string values in JSON', () => {
      const json = {
        name: '<script>alert("xss")</script>',
        age: 25,
        active: true
      };
      const result = sanitizer.sanitizeJson(json);
      expect(result.name).not.toContain('<script>');
      expect(result.age).toBe(25);
      expect(result.active).toBe(true);
    });

    it('should handle nested objects', () => {
      const json = {
        user: {
          name: '<script>alert("xss")</script>',
          profile: {
            bio: 'Hello\x00World'
          }
        }
      };
      const result = sanitizer.sanitizeJson(json);
      expect(result.user.name).not.toContain('<script>');
      expect(result.user.profile.bio).toBe('HelloWorld');
    });

    it('should handle arrays', () => {
      const json = ['<script>alert("xss")</script>', 'safe string', 123];
      const result = sanitizer.sanitizeJson(json);
      expect(result[0]).not.toContain('<script>');
      expect(result[1]).toBe('safe string');
      expect(result[2]).toBe(123);
    });

    it('should handle null and undefined', () => {
      expect(sanitizer.sanitizeJson(null)).toBe(null);
      expect(sanitizer.sanitizeJson(undefined)).toBe(null);
    });
  });

  describe('validateInput', () => {
    it('should validate email input', () => {
      expect(sanitizer.validateInput('test@example.com', InputType.EMAIL)).toBe(true);
      expect(sanitizer.validateInput('invalid-email', InputType.EMAIL)).toBe(false);
    });

    it('should validate URL input', () => {
      expect(sanitizer.validateInput('https://example.com', InputType.URL)).toBe(true);
      expect(sanitizer.validateInput('not-a-url', InputType.URL)).toBe(false);
    });

    it('should validate alphanumeric input', () => {
      expect(sanitizer.validateInput('abc123', InputType.ALPHANUMERIC)).toBe(true);
      expect(sanitizer.validateInput('abc-123', InputType.ALPHANUMERIC)).toBe(false);
    });

    it('should validate numeric input', () => {
      expect(sanitizer.validateInput('12345', InputType.NUMERIC)).toBe(true);
      expect(sanitizer.validateInput('123abc', InputType.NUMERIC)).toBe(false);
    });

    it('should validate UUID input', () => {
      expect(sanitizer.validateInput('550e8400-e29b-41d4-a716-446655440000', InputType.UUID)).toBe(true);
      expect(sanitizer.validateInput('not-a-uuid', InputType.UUID)).toBe(false);
    });

    it('should validate Hedera account ID', () => {
      expect(sanitizer.validateInput('0.0.12345', InputType.HEDERA_ACCOUNT_ID)).toBe(true);
      expect(sanitizer.validateInput('invalid-account', InputType.HEDERA_ACCOUNT_ID)).toBe(false);
    });

    it('should validate DID format', () => {
      expect(sanitizer.validateInput('did:hedera:testnet_12345', InputType.DID)).toBe(true);
      expect(sanitizer.validateInput('invalid-did', InputType.DID)).toBe(false);
    });

    it('should validate JSON input', () => {
      expect(sanitizer.validateInput('{"key": "value"}', InputType.JSON)).toBe(true);
      expect(sanitizer.validateInput('invalid-json', InputType.JSON)).toBe(false);
    });
  });

  describe('escapeSQL', () => {
    it('should escape single quotes', () => {
      const input = "O'Reilly";
      const result = sanitizer.escapeSQL(input);
      expect(result).toBe("O''Reilly");
    });

    it('should escape SQL injection attempts', () => {
      const input = "'; DROP TABLE users; --";
      const result = sanitizer.escapeSQL(input);
      expect(result).not.toContain('; DROP TABLE');
      expect(result).toContain('\\;');
      expect(result).toContain('\\--');
    });

    it('should escape stored procedure calls', () => {
      const input = 'xp_cmdshell';
      const result = sanitizer.escapeSQL(input);
      expect(result).toBe('x_p_cmdshell');
    });
  });

  describe('sanitizeFileName', () => {
    it('should sanitize valid filename', () => {
      const filename = 'document.pdf';
      const result = sanitizer.sanitizeFileName(filename);
      expect(result).toBe('document.pdf');
    });

    it('should remove dangerous characters', () => {
      const filename = 'doc<>ument.pdf';
      const result = sanitizer.sanitizeFileName(filename);
      expect(result).toBe('doc__ument.pdf');
    });

    it('should prevent path traversal', () => {
      const filename = '../../../etc/passwd';
      const result = sanitizer.sanitizeFileName(filename);
      expect(result).toBe('');
    });

    it('should reject invalid extensions', () => {
      const filename = 'malware.exe';
      const result = sanitizer.sanitizeFileName(filename);
      expect(result).toBe('');
    });

    it('should limit filename length', () => {
      const filename = 'a'.repeat(300) + '.pdf';
      const result = sanitizer.sanitizeFileName(filename);
      expect(result.length).toBeLessThanOrEqual(255);
    });
  });

  describe('deepSanitizeObject', () => {
    it('should handle deep nesting', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              value: '<script>alert("xss")</script>'
            }
          }
        }
      };
      const result = sanitizer.deepSanitizeObject(obj);
      expect(result.level1.level2.level3.value).not.toContain('<script>');
    });

    it('should respect max depth limit', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              value: 'test'
            }
          }
        }
      };
      const result = sanitizer.deepSanitizeObject(obj, 2);
      expect(result.level1.level2).toBe(null);
    });

    it('should handle circular references gracefully', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;
      
      // Should not throw an error
      expect(() => sanitizer.deepSanitizeObject(obj, 5)).not.toThrow();
    });
  });
});