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
    creditsConfig?: CreditsConfig & {
      deferred?: boolean;
      reservationId?: string;
    };
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

    describe('completion-settled routes', () => {
      const asCompletion = (
        overrides: Partial<NonNullable<typeof mockRequest.creditsConfig>> = {},
      ) => {
        mockRequest.creditsConfig = {
          amount: 10,
          description: 'Image generation',
          reservationId: 'pool-1',
          settlement: 'completion',
          source: ActivitySource.IMAGE_GENERATION,
          ...overrides,
        };
      };
      const run = (handler: CallHandler) =>
        new Promise<unknown>((resolve, reject) => {
          interceptor.intercept(mockContext, handler).subscribe({
            error: reject,
            next: resolve,
          });
        });

      it('queues no settlement on the response; bound outputs settle on completion', async () => {
        asCompletion({ boundOutputCount: 1 });

        await run(mockHandler);

        expect(
          creditDeductionQueueService.queueDeduction,
        ).not.toHaveBeenCalled();
      });

      it('releases only what no output claimed', async () => {
        asCompletion({ boundOutputCount: 1 });

        await run(mockHandler);

        expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
          organizationId,
          reservationId: 'pool-1',
        });
      });

      it('releases the whole hold and warns when no output was accepted', async () => {
        asCompletion();

        await run(mockHandler);

        expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
          organizationId,
          reservationId: 'pool-1',
        });
        expect(loggerService.warn).toHaveBeenCalledWith(
          expect.stringContaining('bound no output'),
          expect.objectContaining({ reservationId: 'pool-1' }),
        );
      });

      it('leaves the hold open while the service is still binding outputs', async () => {
        asCompletion({ boundOutputCount: 1, isPoolReleaseDeferred: true });

        await run(mockHandler);

        expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalled();
        expect(
          creditDeductionQueueService.queueDeduction,
        ).not.toHaveBeenCalled();
      });

      it('keeps a deferred hold open when the request later fails', async () => {
        asCompletion({ boundOutputCount: 1, isPoolReleaseDeferred: true });
        const failing = {
          handle: () => throwError(() => new Error('gateway timeout')),
        } as CallHandler;

        await expect(run(failing)).rejects.toThrow('gateway timeout');

        expect(creditsUtilsService.releaseReservation).not.toHaveBeenCalled();
      });

      it('releases the request hold when the request fails before any deferral', async () => {
        asCompletion();
        const failing = {
          handle: () => throwError(() => new Error('provider rejected')),
        } as CallHandler;

        await expect(run(failing)).rejects.toThrow('provider rejected');

        expect(creditsUtilsService.releaseReservation).toHaveBeenCalledWith({
          organizationId,
          reservationId: 'pool-1',
        });
      });

      it('still records BYOK usage instead of holding platform credits', async () => {
        asCompletion({ isByokBypass: true, reservationId: undefined });

        await run(mockHandler);

        expect(creditDeductionQueueService.queueByokUsage).toHaveBeenCalledWith(
          expect.objectContaining({ amount: 10 }),
        );
        expect(
          creditDeductionQueueService.queueDeduction,
        ).not.toHaveBeenCalled();
      });
    });

    it('releases the reservation when its settlement job cannot be persisted', async () => {
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

    it('should stamp the generated asset id without changing the charge identity', async () => {
      mockRequest.creditsConfig = {
        amount: 4,
        description: 'Image generation',
        pricingMetadata: {
          marginMultiplier: 1,
          pricingType: 'per-image',
          providerCostUsd: 0.04,
        },
        reservationId: 'reservation-1',
        source: ActivitySource.IMAGE_GENERATION,
      } as CreditsConfig;
      mockRequest.user = { id: 'user_123', organizationId, userId };
      const handler = {
        handle: () => of({ data: { id: 'asset-9' } }),
      } as CallHandler;

      interceptor.intercept(mockContext, handler).subscribe();

      await vi.waitFor(() => {
        const job = vi.mocked(creditDeductionQueueService.queueDeduction).mock
          .calls[0][0];
        expect(job).toMatchObject({
          amount: 4,
          metadata: { assetId: 'asset-9', pricingType: 'per-image' },
          reservationId: 'reservation-1',
        });
        expect(job).not.toHaveProperty('idempotencyKey');
        expect(job).not.toHaveProperty('referenceId');
        expect(job).not.toHaveProperty('settlementAssetId');
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

    it('keeps a deferred clip-chain reservation held on HTTP success', async () => {
      mockRequest.creditsConfig = {
        amount: 61,
        deferred: true,
        description: 'Clip-chain video',
        reservationId: 'reservation-clip-chain',
        source: ActivitySource.VIDEO_GENERATION,
      };
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
              ).not.toHaveBeenCalled();
              expect(
                creditDeductionQueueService.queueByokUsage,
              ).not.toHaveBeenCalled();
              expect(
                creditsUtilsService.releaseReservation,
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
