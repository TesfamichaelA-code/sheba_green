import { Request, Response, NextFunction } from 'express';
import { inject, injectable } from 'inversify';
import { body, param, query } from 'express-validator';
import { TYPES } from '@shared/container/types';
import { MintTokensUseCase } from '@application/use-cases/mint-tokens/mint-tokens.use-case';
import { QueryBus } from '@application/queries/query-bus';
import { CommandBus } from '@application/commands/command-bus';
import { MintTokensCommand } from '@application/commands/mint-tokens/mint-tokens.command';
import { validate } from '../middleware/validation.middleware';
import { authMiddleware, authorize } from '../middleware/auth.middleware';
import { IConfigService } from '@shared/config/config.interface';
import { ITokenService } from '@domain/repositories/token-service.interface';

/**
 * Token Controller
 * 
 * Handles token balance and transaction history endpoints
 * Requirements: 6.3, 6.4
 */
@injectable()
export class TokenController {
  constructor(
    @inject(TYPES.CommandBus) private commandBus: CommandBus,
    @inject(TYPES.QueryBus) private queryBus: QueryBus,
    @inject(TYPES.TokenService) private tokenService: ITokenService,
    @inject(TYPES.ConfigService) private configService: IConfigService
  ) {}

  /**
   * Get token balance for a user
   * GET /api/v1/tokens/balance
   */
  public getBalance = [
    authMiddleware(this.configService),
    validate([
      query('accountId')
        .optional()
        .matches(/^0\.0\.\d+$/)
        .withMessage('Valid Hedera account ID is required'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
          return;
        }

        const accountId = (req.query.accountId as string) || req.user.hederaAccountId;

        // Check if user can access this balance (own account or admin)
        if (accountId !== req.user.hederaAccountId && req.user.role !== 'admin') {
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Cannot access other users token balance',
          });
          return;
        }

        const balance = await this.tokenService.getBalance(accountId);

        res.json({
          success: true,
          data: {
            accountId,
            balance: balance.toString(),
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get token transaction history
   * GET /api/v1/tokens/transactions
   */
  public getTransactionHistory = [
    authMiddleware(this.configService),
    validate([
      query('accountId')
        .optional()
        .matches(/^0\.0\.\d+$/)
        .withMessage('Valid Hedera account ID is required'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be non-negative'),
      query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
      query('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date'),
      query('type')
        .optional()
        .isIn(['mint', 'transfer', 'burn'])
        .withMessage('Type must be mint, transfer, or burn'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
          return;
        }

        const accountId = (req.query.accountId as string) || req.user.hederaAccountId;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
        const type = req.query.type as string;

        // Check if user can access this history
        if (accountId !== req.user.hederaAccountId && req.user.role !== 'admin') {
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Cannot access other users transaction history',
          });
          return;
        }

        // This would use a GetTokenTransactionsQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Transaction history will be implemented with a dedicated query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Mint tokens (admin only)
   * POST /api/v1/tokens/mint
   */
  public mintTokens = [
    authMiddleware(this.configService),
    authorize(['admin', 'system']),
    validate([
      body('accountId')
        .matches(/^0\.0\.\d+$/)
        .withMessage('Valid Hedera account ID is required'),
      body('amount')
        .isNumeric()
        .custom((value) => {
          const num = parseFloat(value);
          return num > 0 && num <= 1000000;
        })
        .withMessage('Amount must be positive and not exceed 1,000,000'),
      body('reason')
        .isLength({ min: 5, max: 500 })
        .trim()
        .withMessage('Reason must be between 5 and 500 characters'),
      body('metadata')
        .optional()
        .isObject()
        .withMessage('Metadata must be an object'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { accountId, amount, reason, metadata } = req.body;

        const command = new MintTokensCommand({
          accountId,
          amount: parseFloat(amount),
          reason,
          metadata,
          mintedBy: req.user!.id,
        });

        const result = await this.commandBus.execute(command);

        res.status(201).json({
          success: true,
          message: 'Tokens minted successfully',
          data: {
            transactionId: result.transactionId,
            accountId,
            amount: amount.toString(),
            newBalance: result.newBalance?.toString(),
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Transfer tokens
   * POST /api/v1/tokens/transfer
   */
  public transferTokens = [
    authMiddleware(this.configService),
    validate([
      body('toAccountId')
        .matches(/^0\.0\.\d+$/)
        .withMessage('Valid recipient Hedera account ID is required'),
      body('amount')
        .isNumeric()
        .custom((value) => {
          const num = parseFloat(value);
          return num > 0;
        })
        .withMessage('Amount must be positive'),
      body('memo')
        .optional()
        .isLength({ max: 100 })
        .trim()
        .withMessage('Memo must not exceed 100 characters'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
          return;
        }

        const { toAccountId, amount, memo } = req.body;
        const fromAccountId = req.user.hederaAccountId;

        // Check if user has sufficient balance
        const balance = await this.tokenService.getBalance(fromAccountId);
        const transferAmount = parseFloat(amount);

        if (parseFloat(balance.toString()) < transferAmount) {
          res.status(400).json({
            error: 'INSUFFICIENT_BALANCE',
            message: 'Insufficient token balance for transfer',
          });
          return;
        }

        const transactionId = await this.tokenService.transferTokens(
          fromAccountId,
          toAccountId,
          transferAmount
        );

        res.json({
          success: true,
          message: 'Tokens transferred successfully',
          data: {
            transactionId,
            fromAccountId,
            toAccountId,
            amount: amount.toString(),
            memo,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get token information
   * GET /api/v1/tokens/info
   */
  public getTokenInfo = [
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // This would get token metadata from Hedera
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Token info will be implemented with Hedera token metadata query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get token supply information
   * GET /api/v1/tokens/supply
   */
  public getSupplyInfo = [
    authMiddleware(this.configService),
    authorize(['admin']),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // This would get token supply information from Hedera
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Supply info will be implemented with Hedera token supply query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get token holders (admin only)
   * GET /api/v1/tokens/holders
   */
  public getTokenHolders = [
    authMiddleware(this.configService),
    authorize(['admin']),
    validate([
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be non-negative'),
      query('minBalance')
        .optional()
        .isNumeric()
        .withMessage('Minimum balance must be numeric'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const minBalance = req.query.minBalance ? parseFloat(req.query.minBalance as string) : 0;

        // This would use a GetTokenHoldersQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Token holders will be implemented with a dedicated query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];
}