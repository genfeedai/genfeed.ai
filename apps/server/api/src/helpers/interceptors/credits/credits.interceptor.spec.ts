import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivitySource } from '@genfeedai/enums';
import type { CreditsConfig } from '@genfeedai/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable, of, throwError } from 'rxjs';

const organizationId = testId('org');
const userId = testId('user');

describe('CreditsInterceptor', () => {
  let interceptor: CreditsInterceptor;
  let creditDeductionQueueService: CreditDeductionQueueService;
  let loggerService: LoggerService;

  const mockRequest: {
    creditsConfig?: CreditsConfig;
    user?: {
      id: string;
      organizationId: string;
      userId: string;
    } | null;
  } = {
    creditsConfig: {
      amount: 10,
      description: 'Test operation',
      source: ActivitySource.SCRIPT,
    } as CreditsConfig,
    user: {
      id: 'user_123',
      organizationId,
      userId,
    },
  };

  const mockContext = {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
  } as ExecutionContext;

  const mockHandler = {
    handle: () => of({ success: true }),
  } as CallHandler;

  beforeEach(async () => {
    const mockCreditDeductionQueueService = {
      queueByokUsage: vi.fn().mockResolvedValue(undefined),
      queueDeduction: vi.fn().mockResolvedValue(undefined),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditsInterceptor,
        {
          provide: CreditDeductionQueueService,
          useValue: mockCreditDeductionQueueService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    interceptor = module.get<CreditsInterceptor>(CreditsInterceptor);
    creditDeductionQueueService = module.get<CreditDeductionQueueService>(
      CreditDeductionQueueService,
    );
    loggerService = module.get<LoggerService>(LoggerService);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should pass through when no credits config', () => {
      mockRequest.creditsConfig = undefined;

      const result = interceptor.intercept(mockContext, mockHandler);

      expect(result).toBeInstanceOf(Observable);
      result.subscribe((data) => {
        expect(data).toEqual({ success: true });
      });
      expect(creditDeductionQueueService.queueDeduction).not.toHaveBeenCalled();
    });

    it('should pass through when credits amount is undefined', () => {
      mockRequest.creditsConfig = {
        amount: undefined,
        description: 'Test operation',
      } as CreditsConfig;

      const result = interceptor.intercept(mockContext, mockHandler);

      expect(result).toBeInstanceOf(Observable);
      result.subscribe((data) => {
        expect(data).toEqual({ success: true });
      });
      expect(creditDeductionQueueService.queueDeduction).not.toHaveBeenCalled();
    });

    it('should pass through when no user', () => {
      mockRequest.user = null;

      const result = interceptor.intercept(mockContext, mockHandler);

      expect(result).toBeInstanceOf(Observable);
      result.subscribe((data) => {
        expect(data).toEqual({ success: true });
      });
      expect(creditDeductionQueueService.queueDeduction).not.toHaveBeenCalled();
    });

    it('should queue credit deduction on successful operation', async () => {
      mockRequest.creditsConfig = {
        amount: 10,
        description: 'Test operation',
        source: ActivitySource.SCRIPT,
      } as CreditsConfig;
      mockRequest.user = {
        id: 'user_123',
        organizationId,
        userId,
      };

      const result = interceptor.intercept(mockContext, mockHandler);

      await new Promise<void>((resolve) => {
        result.subscribe({
          next: (data) => {
            expect(data).toEqual({ success: true });
            setTimeout(() => {
              expect(
                creditDeductionQueueService.queueDeduction,
              ).toHaveBeenCalledWith({
                amount: 10,
                description: 'Test operation',
                organizationId,
                source: ActivitySource.SCRIPT,
                type: 'deduct-credits',
                userId,
              });
              expect(loggerService.log).toHaveBeenCalledWith(
                'Credit deduction job queued',
                {
                  amount: 10,
                  description: 'Test operation',
                  isByokBypass: undefined,
                  userId: 'user_123',
                },
              );
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should forward the pricing audit stamp as deduction metadata', async () => {
      mockRequest.creditsConfig = {
        amount: 120,
        description: 'Video generation',
        pricingMetadata: {
          marginMultiplier: 1.2,
          pricingType: 'per-second',
          providerCostUsd: 0.24,
        },
        source: ActivitySource.SCRIPT,
      } as CreditsConfig;
      mockRequest.user = {
        id: 'user_123',
        organizationId: '507f1f77bcf86cd799439013',
        userId: '507f1f77bcf86cd799439012',
      };

      const result = interceptor.intercept(mockContext, mockHandler);

      await new Promise<void>((resolve) => {
        result.subscribe({
          next: () => {
            setTimeout(() => {
              expect(
                creditDeductionQueueService.queueDeduction,
              ).toHaveBeenCalledWith({
                amount: 120,
                description: 'Video generation',
                metadata: {
                  marginMultiplier: 1.2,
                  pricingType: 'per-second',
                  providerCostUsd: 0.24,
                },
                organizationId: '507f1f77bcf86cd799439013',
                source: ActivitySource.SCRIPT,
                type: 'deduct-credits',
                userId: '507f1f77bcf86cd799439012',
              });
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should queue BYOK usage when isByokBypass is true', async () => {
      mockRequest.creditsConfig = {
        amount: 5,
        description: 'BYOK operation',
        isByokBypass: true,
        source: ActivitySource.SCRIPT,
      } as CreditsConfig;
      mockRequest.user = {
        id: 'user_123',
        organizationId,
        userId,
      };

      const result = interceptor.intercept(mockContext, mockHandler);

      await new Promise<void>((resolve) => {
        result.subscribe({
          next: () => {
            setTimeout(() => {
              expect(
                creditDeductionQueueService.queueByokUsage,
              ).toHaveBeenCalledWith({
                amount: 5,
                description: 'BYOK operation',
                organizationId,
                source: ActivitySource.SCRIPT,
                type: 'record-byok-usage',
              });
              expect(
                creditDeductionQueueService.queueDeduction,
              ).not.toHaveBeenCalled();
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should not deduct credits on operation failure', async () => {
      mockRequest.creditsConfig = {
        amount: 10,
        description: 'Test operation',
        source: ActivitySource.SCRIPT,
      } as CreditsConfig;
      mockRequest.user = {
        id: 'user_123',
        organizationId,
        userId,
      };

      const mockHandlerWithError = {
        handle: () => throwError(() => new Error('Operation failed')),
      } as CallHandler;

      vi.spyOn(loggerService, 'debug').mockImplementation(() => {
        /* noop */
      });

      const result = interceptor.intercept(mockContext, mockHandlerWithError);

      await new Promise<void>((resolve) => {
        result.subscribe({
          error: (error) => {
            expect(error.message).toBe('Operation failed');
            expect(loggerService.debug).toHaveBeenCalledWith(
              'Operation failed, credits not deducted',
              {
                amount: 10,
                organizationId,
              },
            );
            expect(
              creditDeductionQueueService.queueDeduction,
            ).not.toHaveBeenCalled();
            resolve();
          },
        });
      });
    });

    it('should use default source when not provided', async () => {
      mockRequest.creditsConfig = {
        amount: 5,
        description: 'Test operation',
      } as CreditsConfig;
      mockRequest.user = {
        id: 'user_123',
        organizationId,
        userId,
      };

      const result = interceptor.intercept(mockContext, mockHandler);

      await new Promise<void>((resolve) => {
        result.subscribe({
          next: () => {
            setTimeout(() => {
              expect(
                creditDeductionQueueService.queueDeduction,
              ).toHaveBeenCalledWith({
                amount: 5,
                description: 'Test operation',
                organizationId,
                source: ActivitySource.SCRIPT, // Default source
                type: 'deduct-credits',
                userId,
              });
              resolve();
            }, 10);
          },
        });
      });
    });
  });
});
