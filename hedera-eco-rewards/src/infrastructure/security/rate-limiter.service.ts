import { Injectable } from '../container/injectable.decorator';

export interface IRateLimiterService {
  checkLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
  resetLimit(key: string): Promise<void>;
  getUsage(key: string): Promise<RateLimitUsage>;
  configureDDoSProtection(config: DDoSConfig): void;
  isBlocked(ip: string): Promise<boolean>;
  blockIP(ip: string, durationMs: number): Promise<void>;
  unblockIP(ip: string): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

export interface RateLimitUsage {
  count: number;
  remaining: number;
  resetTime: Date;
}

export interface DDoSConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  blockDurationMs: number;
  suspiciousThreshold: number;
  enableAutoBlock: boolean;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked?: boolean;
  blockExpiry?: number;
}

@Injectable()
export class RateLimiterService implements IRateLimiterService {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly blockedIPs = new Map<string, number>(); // IP -> block expiry time
  private ddosConfig: DDoSConfig;

  constructor() {
    this.ddosConfig = {
      maxRequestsPerMinute: 100,
      maxRequestsPerHour: 1000,
      blockDurationMs: 15 * 60 * 1000, // 15 minutes
      suspiciousThreshold: 50,
      enableAutoBlock: true
    };

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  async checkLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    let entry = this.store.get(key);
    
    // Check if entry exists and is within the current window
    if (!entry || entry.resetTime <= now) {
      entry = {
        count: 0,
        resetTime: now + windowMs
      };
    }

    // Check if IP is blocked
    if (await this.isBlocked(this.extractIP(key))) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(entry.resetTime),
        retryAfter: Math.ceil((this.blockedIPs.get(this.extractIP(key))! - now) / 1000)
      };
    }

    entry.count++;
    this.store.set(key, entry);

    const allowed = entry.count <= limit;
    const remaining = Math.max(0, limit - entry.count);

    // DDoS protection check
    if (this.ddosConfig.enableAutoBlock && !allowed) {
      await this.checkForDDoSAttack(key, entry.count);
    }

    return {
      allowed,
      remaining,
      resetTime: new Date(entry.resetTime),
      retryAfter: allowed ? undefined : Math.ceil((entry.resetTime - now) / 1000)
    };
  }

  async resetLimit(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getUsage(key: string): Promise<RateLimitUsage> {
    const entry = this.store.get(key);
    
    if (!entry) {
      return {
        count: 0,
        remaining: 0,
        resetTime: new Date()
      };
    }

    return {
      count: entry.count,
      remaining: 0, // Would need limit parameter to calculate
      resetTime: new Date(entry.resetTime)
    };
  }

  configureDDoSProtection(config: DDoSConfig): void {
    this.ddosConfig = { ...this.ddosConfig, ...config };
  }

  async isBlocked(ip: string): Promise<boolean> {
    const blockExpiry = this.blockedIPs.get(ip);
    if (!blockExpiry) {
      return false;
    }

    if (Date.now() > blockExpiry) {
      this.blockedIPs.delete(ip);
      return false;
    }

    return true;
  }

  async blockIP(ip: string, durationMs: number): Promise<void> {
    const blockExpiry = Date.now() + durationMs;
    this.blockedIPs.set(ip, blockExpiry);
    
    // Log the blocking event
    console.warn(`IP ${ip} has been blocked until ${new Date(blockExpiry).toISOString()}`);
  }

  async unblockIP(ip: string): Promise<void> {
    this.blockedIPs.delete(ip);
    console.info(`IP ${ip} has been unblocked`);
  }

  private async checkForDDoSAttack(key: string, requestCount: number): Promise<void> {
    const ip = this.extractIP(key);
    
    // Check requests per minute
    const minuteKey = `${ip}:minute:${Math.floor(Date.now() / (60 * 1000))}`;
    const minuteEntry = this.store.get(minuteKey) || { count: 0, resetTime: 0 };
    
    if (minuteEntry.count > this.ddosConfig.maxRequestsPerMinute) {
      await this.blockIP(ip, this.ddosConfig.blockDurationMs);
      return;
    }

    // Check requests per hour
    const hourKey = `${ip}:hour:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
    const hourEntry = this.store.get(hourKey) || { count: 0, resetTime: 0 };
    
    if (hourEntry.count > this.ddosConfig.maxRequestsPerHour) {
      await this.blockIP(ip, this.ddosConfig.blockDurationMs * 4); // Longer block for hourly limit
      return;
    }

    // Check for suspicious patterns
    if (requestCount > this.ddosConfig.suspiciousThreshold) {
      console.warn(`Suspicious activity detected from IP ${ip}: ${requestCount} requests`);
      
      // Implement progressive blocking
      const blockDuration = Math.min(
        this.ddosConfig.blockDurationMs * Math.floor(requestCount / this.ddosConfig.suspiciousThreshold),
        24 * 60 * 60 * 1000 // Max 24 hours
      );
      
      await this.blockIP(ip, blockDuration);
    }
  }

  private extractIP(key: string): string {
    // Extract IP from key (assuming format like "ip:endpoint" or just "ip")
    return key.split(':')[0];
  }

  private cleanup(): void {
    const now = Date.now();
    
    // Clean up expired rate limit entries
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key);
      }
    }

    // Clean up expired IP blocks
    for (const [ip, blockExpiry] of this.blockedIPs.entries()) {
      if (now > blockExpiry) {
        this.blockedIPs.delete(ip);
      }
    }
  }

  // Advanced rate limiting strategies
  async checkSlidingWindowLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get all requests in the sliding window
    const requests = this.getRequestsInWindow(key, windowStart, now);
    const allowed = requests.length < limit;
    
    if (allowed) {
      this.recordRequest(key, now);
    }

    return {
      allowed,
      remaining: Math.max(0, limit - requests.length),
      resetTime: new Date(now + windowMs),
      retryAfter: allowed ? undefined : Math.ceil(windowMs / 1000)
    };
  }

  private getRequestsInWindow(key: string, start: number, end: number): number[] {
    const requestKey = `${key}:requests`;
    const entry = this.store.get(requestKey);
    
    if (!entry || !Array.isArray((entry as any).requests)) {
      return [];
    }

    return ((entry as any).requests as number[]).filter((timestamp: number) => 
      timestamp >= start && timestamp <= end
    );
  }

  private recordRequest(key: string, timestamp: number): void {
    const requestKey = `${key}:requests`;
    const entry = this.store.get(requestKey) || { requests: [], resetTime: 0 };
    
    (entry as any).requests = (entry as any).requests || [];
    (entry as any).requests.push(timestamp);
    
    // Keep only recent requests (last hour)
    const oneHourAgo = timestamp - (60 * 60 * 1000);
    (entry as any).requests = (entry as any).requests.filter((ts: number) => ts > oneHourAgo);
    
    this.store.set(requestKey, entry);
  }

  // Adaptive rate limiting based on system load
  async getAdaptiveLimit(baseLimit: number, systemLoad: number): Promise<number> {
    if (systemLoad < 0.5) {
      return baseLimit;
    } else if (systemLoad < 0.8) {
      return Math.floor(baseLimit * 0.7);
    } else {
      return Math.floor(baseLimit * 0.3);
    }
  }

  // Whitelist management
  private whitelist = new Set<string>();

  addToWhitelist(ip: string): void {
    this.whitelist.add(ip);
  }

  removeFromWhitelist(ip: string): void {
    this.whitelist.delete(ip);
  }

  isWhitelisted(ip: string): boolean {
    return this.whitelist.has(ip);
  }
}