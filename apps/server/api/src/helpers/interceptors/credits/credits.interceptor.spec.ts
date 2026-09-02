import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivitySource } from '@genfeedai/contracts';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
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
  let creditsUtilsService: { releaseReservation: ReturnType<typeof vi.fn> };
  let loggerService: LoggerService;

  const mockRequest: {
    body?: { sourceActionId?: string };
    creditsConfig?: CreditsConfig & { reservationId?: string };
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
    delete mockRequest.body;
    mockRequest.creditsConfig = {
      amount: 10,
      description: 'Test operation',
      source: ActivitySource.SCRIPT,
    };
    mockRequest.user = {
      id: 'user_123',
      organizationId,
      userId,
    };
    const mockCreditDeductionQueueService = {
      queueByokUsage: vi.fn().mockResolvedValue(undefined),
      queueDeduction: vi.fn().mockResolvedValue(undefined),
    };
    creditsUtilsService = {
      releaseReservation: vi.fn().mockResolvedValue(undefined),
    };

    const mockLoggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
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
        {
          provide: CreditsUtilsService,
          useValue: creditsUtilsService,
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

    it('queues confirmed media settlement against the persisted asset identity', async () => {
      mockRequest.body = { sourceActionId: 'action-123' };
      mockRequest.creditsConfig = {
        amount: 10,
        description: 'Image generation',
        reservationId: 'reservation-1',
        source: ActivitySource.IMAGE_GENERATION,
      };
      mockRequest.user = {
        id: 'user_123',
        organizationId,
        userId,
      };
      const handler = {
        handle: () => of({ data: { id: 'asset-123' } }),
      } as CallHandler;

      interceptor.intercept(mockContext, handler).subscribe();

      await vi.waitFor(() =>
        expect(creditDeductionQueueService.queueDeduction).toHaveBeenCalledWith(
          expect.objectContaining({
            idempotencyKey: 'agent-media-action-123-asset-123',
            referenceId: 'asset-123',
            referenceType: 'agent-media:generation',
            reservationId: 'reservation-1',
            settlementAssetId: 'asset-123',
          }),
        ),
      );
    });

    it('recognizes a JSON:API source action before deferring media settlement', async () => {
      mockRequest.body = {
        data: {
          attributes: { sourceActionId: 'json-api-action' },
        },
      } as never;
      mockRequest.creditsConfig = {
        amount: 10,
        description: 'Image generation',
        reservationId: 'reservation-json-api',
        source: ActivitySource.IMAGE_GENERATION,
      };
      const handler = {
        handle: () => of({ data: { id: 'asset-json-api' } }),
      } as CallHandler;

      interceptor.intercept(mockContext, handler).subscribe();

      await vi.waitFor(() =>
        expect(creditDeductionQueueService.queueDeduction).toHaveBeenCalledWith(
          expect.objectContaining({
            idempotencyKey: 'agent-media-json-api-action-asset-json-api',
            reservationId: 'reservation-json-api',
            settlementAssetId: 'asset-json-api',
          }),
        ),
      );
    });

    it('does not charge confirmed media when acceptance returned no persisted asset', async () => {
      mockRequest.body = { sourceActionId: 'action-without-asset' };
      mockRequest.creditsConfig = {
        amount: 10,
        description: 'Image generation',
        reservationId: 'reservation-1',
        source: ActivitySource.IMAGE_GENERATION,
      };
      mockRequest.user = {
        id: 'user_123',
        organizationId,
        userId,
      };

      interceptor.intercept(mockContext, mockHandler).subscribe();

      await vi.waitFor(() =>
        expect(
          creditDeductionQueueService.queueDeduction,
        ).not.toHaveBeenCalled(),
      );
      expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
        organizationId,
        reservationId: 'reservation-1',
      });
    });

    it('fails media acceptance when its durable settlement job cannot be persisted', async () => {
      mockRequest.body = { sourceActionId: 'action-queue-failure' };
      mockRequest.creditsConfig = {
        amount: 10,
        description: 'Image generation',
        reservationId: 'reservation-queue-failure',
        source: ActivitySource.IMAGE_GENERATION,
      };
      mockRequest.user = {
        id: 'user_123',
        organizationId,
        userId,
      };
      vi.mocked(
        creditDeductionQueueService.queueDeduction,
      ).mockRejectedValueOnce(new Error('settlement queue unavailable'));
      const handler = {
        handle: () => of({ data: { id: 'asset-queue-failure' } }),
      } as CallHandler;

      await expect(
        new Promise((resolve, reject) => {
          interceptor.intercept(mockContext, handler).subscribe({
            error: reject,
            next: resolve,
          });
        }),
      ).rejects.toThrow('settlement queue unavailable');
      expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
        organizationId,
        reservationId: 'reservation-queue-failure',
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
                amount: 120,
                description: 'Video generation',
                metadata: {
                  marginMultiplier: 1.2,
                  pricingType: 'per-second',
                  providerCostUsd: 0.24,
                },
                organizationId,
                source: ActivitySource.SCRIPT,
                type: 'deduct-credits',
                userId,
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
        reservationId: 'reservation-1',
        source: ActivitySource.SCRIPT,
      };
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
            expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith(
              {
                organizationId,
                reservationId: 'reservation-1',
              },
            );
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
