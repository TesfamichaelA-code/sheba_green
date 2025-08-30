import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    rateLimiter = new RateLimiterService();
  });

  describe('checkLimit', () => {
    it('should allow requests within limit', async () => {
      const key = 'test-key';
      const limit = 5;
      const windowMs = 60000; // 1 minute

      const result = await rateLimiter.checkLimit(key, limit, windowMs);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it('should track multiple requests', async () => {
      const key = 'test-key';
      const limit = 3;
      const windowMs = 60000;

      // First request
      let result = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);

      // Second request
      result = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);

      // Third request
      result = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);

      // Fourth request (should be blocked)
      result = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reset after window expires', async () => {
      const key = 'test-key';
      const limit = 2;
      const windowMs = 100; // 100ms

      // Exhaust the limit
      await rateLimiter.checkLimit(key, limit, windowMs);
      await rateLimiter.checkLimit(key, limit, windowMs);
      
      let result = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be allowed again
      result = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);
    });

    it('should handle different keys independently', async () => {
      const limit = 2;
      const windowMs = 60000;

      // Exhaust limit for key1
      await rateLimiter.checkLimit('key1', limit, windowMs);
      await rateLimiter.checkLimit('key1', limit, windowMs);
      
      let result = await rateLimiter.checkLimit('key1', limit, windowMs);
      expect(result.allowed).toBe(false);

      // key2 should still be allowed
      result = await rateLimiter.checkLimit('key2', limit, windowMs);
      expect(result.allowed).toBe(true);
    });
  });

  describe('resetLimit', () => {
    it('should reset the limit for a key', async () => {
      const key = 'test-key';
      const limit = 2;
      const windowMs = 60000;

      // Exhaust the limit
      await rateLimiter.checkLimit(key, limit, windowMs);
      await rateLimiter.checkLimit(key, limit, windowMs);
      
      let result = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(result.allowed).toBe(false);

      // Reset the limit
      await rateLimiter.resetLimit(key);

      // Should be allowed again
      result = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);
    });
  });

  describe('getUsage', () => {
    it('should return usage information', async () => {
      const key = 'test-key';
      const limit = 5;
      const windowMs = 60000;

      // Make some requests
      await rateLimiter.checkLimit(key, limit, windowMs);
      await rateLimiter.checkLimit(key, limit, windowMs);

      const usage = await rateLimiter.getUsage(key);
      expect(usage.count).toBe(2);
      expect(usage.resetTime).toBeInstanceOf(Date);
    });

    it('should return zero usage for non-existent key', async () => {
      const usage = await rateLimiter.getUsage('non-existent-key');
      expect(usage.count).toBe(0);
    });
  });

  describe('IP blocking', () => {
    it('should block and unblock IPs', async () => {
      const ip = '192.168.1.1';
      const duration = 1000; // 1 second

      // Initially not blocked
      expect(await rateLimiter.isBlocked(ip)).toBe(false);

      // Block the IP
      await rateLimiter.blockIP(ip, duration);
      expect(await rateLimiter.isBlocked(ip)).toBe(true);

      // Unblock the IP
      await rateLimiter.unblockIP(ip);
      expect(await rateLimiter.isBlocked(ip)).toBe(false);
    });

    it('should automatically unblock after duration', async () => {
      const ip = '192.168.1.1';
      const duration = 100; // 100ms

      await rateLimiter.blockIP(ip, duration);
      expect(await rateLimiter.isBlocked(ip)).toBe(true);

      // Wait for block to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(await rateLimiter.isBlocked(ip)).toBe(false);
    });

    it('should prevent requests from blocked IPs', async () => {
      const ip = '192.168.1.1';
      const key = `${ip}:endpoint`;
      const limit = 5;
      const windowMs = 60000;

      // Block the IP
      await rateLimiter.blockIP(ip, 60000);

      // Request should be denied
      const result = await rateLimiter.checkLimit(key, limit, windowMs);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('DDoS protection', () => {
    it('should configure DDoS protection', () => {
      const config = {
        maxRequestsPerMinute: 200,
        maxRequestsPerHour: 2000,
        blockDurationMs: 30 * 60 * 1000,
        suspiciousThreshold: 100,
        enableAutoBlock: true
      };

      rateLimiter.configureDDoSProtection(config);
      // Configuration should be applied (no direct way to test without exposing internals)
    });
  });

  describe('whitelist management', () => {
    it('should manage IP whitelist', () => {
      const ip = '192.168.1.100';

      expect(rateLimiter.isWhitelisted(ip)).toBe(false);

      rateLimiter.addToWhitelist(ip);
      expect(rateLimiter.isWhitelisted(ip)).toBe(true);

      rateLimiter.removeFromWhitelist(ip);
      expect(rateLimiter.isWhitelisted(ip)).toBe(false);
    });
  });

  describe('sliding window rate limiting', () => {
    it('should implement sliding window correctly', async () => {
      const key = 'sliding-test';
      const limit = 3;
      const windowMs = 1000; // 1 second

      // Make requests at different times
      let result = await rateLimiter.checkSlidingWindowLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 300));
      result = await rateLimiter.checkSlidingWindowLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 300));
      result = await rateLimiter.checkSlidingWindowLimit(key, limit, windowMs);
      expect(result.allowed).toBe(true);

      // This should be blocked
      result = await rateLimiter.checkSlidingWindowLimit(key, limit, windowMs);
      expect(result.allowed).toBe(false);
    });
  });

  describe('adaptive rate limiting', () => {
    it('should adjust limits based on system load', async () => {
      const baseLimit = 100;

      // Low load
      let adaptiveLimit = await rateLimiter.getAdaptiveLimit(baseLimit, 0.3);
      expect(adaptiveLimit).toBe(baseLimit);

      // Medium load
      adaptiveLimit = await rateLimiter.getAdaptiveLimit(baseLimit, 0.6);
      expect(adaptiveLimit).toBe(70);

      // High load
      adaptiveLimit = await rateLimiter.getAdaptiveLimit(baseLimit, 0.9);
      expect(adaptiveLimit).toBe(30);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully', async () => {
      // Mock console.error to avoid noise in tests
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // This should not throw
      await expect(rateLimiter.checkLimit('test', 10, 60000)).resolves.toBeDefined();

      consoleSpy.mockRestore();
    });
  });
});