import jwt from 'jsonwebtoken';
import { ConfigService } from '../../../shared/config/config.service';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';

export interface TokenPayload {
  sub: string; // User ID
  hederaAccountId: string;
  did: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor(private configService: ConfigService) {
    this.jwtSecret = this.configService.get('JWT_SECRET');
    this.jwtRefreshSecret = this.configService.get('JWT_REFRESH_SECRET');
    this.accessTokenExpiry = this.configService.get('JWT_ACCESS_EXPIRY') || '15m';
    this.refreshTokenExpiry = this.configService.get('JWT_REFRESH_EXPIRY') || '7d';

    if (!this.jwtSecret || !this.jwtRefreshSecret) {
      throw new Error('JWT secrets not configured');
    }
  }

  generateTokens(payload: Omit<TokenPayload, 'iat' | 'exp'>): AuthTokens {
    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'hedera-eco-rewards',
      audience: 'hedera-eco-rewards-api'
    });

    const refreshToken = jwt.sign(
      { sub: payload.sub },
      this.jwtRefreshSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'hedera-eco-rewards',
        audience: 'hedera-eco-rewards-api'
      }
    );

    // Calculate expiry time in seconds
    const decoded = jwt.decode(accessToken) as any;
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

    return {
      accessToken,
      refreshToken,
      expiresIn
    };
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'hedera-eco-rewards',
        audience: 'hedera-eco-rewards-api'
      }) as TokenPayload;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  verifyRefreshToken(token: string): { sub: string } {
    try {
      return jwt.verify(token, this.jwtRefreshSecret, {
        issuer: 'hedera-eco-rewards',
        audience: 'hedera-eco-rewards-api'
      }) as { sub: string };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  refreshAccessToken(refreshToken: string, userPayload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    // Verify refresh token
    const decoded = this.verifyRefreshToken(refreshToken);
    
    if (decoded.sub !== userPayload.sub) {
      throw new Error('Token mismatch');
    }

    // Generate new access token
    return jwt.sign(userPayload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'hedera-eco-rewards',
      audience: 'hedera-eco-rewards-api'
    });
  }

  validateHederaAccountId(accountId: string): boolean {
    try {
      new HederaAccountId(accountId);
      return true;
    } catch {
      return false;
    }
  }
}