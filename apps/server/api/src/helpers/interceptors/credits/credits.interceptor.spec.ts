import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import {
  CreditsInterceptor,
  type CreditsInterceptorRequest,
  type DeferredCreditsConfig,
} from '@api/helpers/interceptors/credits/credits.interceptor';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivitySource } from '@genfeedai/contracts';
import type { QueuedCreditChargeData } from '@genfeedai/contracts/queue';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { LoggerService } from '@libs/logger/logger.service';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { lastValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

interface QueuedJob {
  data: QueuedCreditChargeData;
  id: string;
  name: string;
}

const USER = {
  id: 'user_123',
  organizationId: 'org-1',
  userId: 'user-1',
} as AuthenticatedUser;

const quote = quoteModelBillablePricing(
  billableProfile(),
  { modelKey: 'test/model', outputs: 2, provider: 'replicate', requests: 2 },
  1,
  '2026-09-30T00:00:00.000Z',
);

const respond = (response: unknown = { success: true }): CallHandler => ({
  handle: () => of(response),
});
const fail = (error: unknown): CallHandler => ({
  handle: () => throwError(() => error),
});

describe('CreditsInterceptor', () => {
  // The credit-deduction queue, the holds released back to the wallet, the
  // quote groups whose dispatch closed, and what was logged.
  let jobs: QueuedJob[];
  let releasedHolds: string[];
  let closedGroups: string[];
  let warnings: string[];
  let errors: string[];
  let isQueueDown: boolean;
  let isWalletDown: boolean;
  let interceptor: CreditsInterceptor;

  beforeEach(() => {
    jobs = [];
    releasedHolds = [];
    closedGroups = [];
    warnings = [];
    errors = [];
    isQueueDown = false;
    isWalletDown = false;

    const logger = {
      debug: () => undefined,
      error: (message: string) => {
        errors.push(message);
      },
      log: () => undefined,
      warn: (message: string) => {
        warnings.push(message);
      },
    } as unknown as LoggerService;
    // BullMQ keeps one job per id.
    const queue = {
      add: async (
        name: string,
        data: QueuedCreditChargeData,
        opts: { jobId: string },
      ) => {
        if (isQueueDown) throw new Error('settlement queue unavailable');
        jobs.push({ data, id: opts.jobId, name });
      },
      getJob: async (id: string) =>
        jobs.some((job) => job.id === id)
          ? { getState: async () => 'waiting' }
          : undefined,
    } as unknown as Queue;

    interceptor = new CreditsInterceptor(
      new CreditDeductionQueueService(queue, logger),
      {
        releaseReservation: async ({
          reservationId,
        }: {
          reservationId: string;
        }) => {
          if (isWalletDown) throw new Error('wallet unavailable');
          releasedHolds.push(reservationId);
        },
      } as unknown as CreditsUtilsService,
      logger,
      {
        closeDispatch: async (reservationId: string) => {
          closedGroups.push(reservationId);
        },
      } as unknown as GenerationQuoteGroupService,
    );
  });

  const intercept = (
    handler: CallHandler,
    creditsConfig?: DeferredCreditsConfig,
    user: AuthenticatedUser | null = USER,
  ) => {
    // null stands for an anonymous request; a default would swallow undefined.
    const request: CreditsInterceptorRequest = {
      creditsConfig,
      user: user ?? undefined,
    };
    return lastValueFrom(
      interceptor.intercept(
        {
          switchToHttp: () => ({ getRequest: () => request }),
        } as unknown as ExecutionContext,
        handler,
      ),
    );
  };
  const settle = (creditsConfig: DeferredCreditsConfig, response?: unknown) =>
    interceptor.settle({ creditsConfig, user: USER }, response);

  const charge = (fields: Partial<DeferredCreditsConfig> = {}) =>
    ({
      amount: 10,
      description: 'Test operation',
      source: ActivitySource.SCRIPT,
      ...fields,
    }) as DeferredCreditsConfig;

  describe('successful requests', () => {
    it('queues the charge for the requesting organization and user', async () => {
      await expect(intercept(respond(), charge())).resolves.toEqual({
        success: true,
      });

      expect(jobs).toEqual([
        {
          data: {
            amount: 10,
            description: 'Test operation',
            idempotencyKey: expect.stringMatching(/^credit-settle:/),
            organizationId: 'org-1',
            source: ActivitySource.SCRIPT,
            type: 'deduct-credits',
            userId: 'user-1',
          },
          id: expect.stringMatching(/^credit-deduct-org-1-credit-settle-/),
          name: 'deduct-credits',
        },
      ]);
    });

    it.each([
      ['the identity brand', 'brand-1', 'brand-1'],
      ['no brand without one', '', undefined],
    ])('attributes the charge to %s', async (_case, brandId, charged) => {
      await interceptor.settle(
        { creditsConfig: charge(), user: { ...USER, brandId } },
        undefined,
      );

      expect(jobs[0]?.data.brandId).toBe(charged);
    });

    it('charges the scripted source when the route names none', async () => {
      await intercept(respond(), charge({ source: undefined }));

      expect(jobs[0]?.data.source).toBe(ActivitySource.SCRIPT);
    });

    it('forwards the pricing audit stamp with the generated asset id', async () => {
      await intercept(
        respond({ data: { id: 'asset-9' } }),
        charge({
          amount: 4,
          pricingMetadata: {
            marginMultiplier: 1,
            pricingType: 'per-image',
            providerCostUsd: 0.04,
          },
          reservationId: 'reservation-1',
        }),
      );

      expect(jobs).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 4,
            idempotencyKey: 'credit-settle:reservation-1',
            metadata: {
              assetId: 'asset-9',
              marginMultiplier: 1,
              pricingType: 'per-image',
              providerCostUsd: 0.04,
            },
            reservationId: 'reservation-1',
          }),
        }),
      ]);
    });

    it('queues BYOK usage instead of a deduction', async () => {
      await intercept(respond(), charge({ amount: 5, isByokBypass: true }));

      expect(jobs).toEqual([
        {
          data: {
            amount: 5,
            description: 'Test operation',
            idempotencyKey: expect.stringMatching(/^byok-usage:/),
            organizationId: 'org-1',
            source: ActivitySource.SCRIPT,
            type: 'record-byok-usage',
          },
          id: expect.stringMatching(/^byok-usage-org-1-byok-usage-/),
          name: 'record-byok-usage',
        },
      ]);
    });

    it.each([
      ['there is no credits config', undefined, USER],
      ['there is no user', charge(), null],
      ['the amount is unknown', charge({ amount: undefined }), USER],
      ['the amount is zero', charge({ amount: 0 }), USER],
    ])('charges nothing when %s', async (_case, config, user) => {
      await expect(intercept(respond(), config, user)).resolves.toEqual({
        success: true,
      });

      expect(jobs).toEqual([]);
      expect(releasedHolds).toEqual([]);
    });

    it('gives back a hold whose final amount came to nothing', async () => {
      await intercept(respond(), charge({ amount: 0, reservationId: 'r-0' }));

      expect(jobs).toEqual([]);
      expect(releasedHolds).toEqual(['r-0']);
    });

    it('keeps a deferred clip-chain hold open', async () => {
      await intercept(
        respond(),
        charge({ deferred: true, reservationId: 'reservation-clip-chain' }),
      );

      expect(jobs).toEqual([]);
      expect(releasedHolds).toEqual([]);
    });

    it('releases the hold and fails the request when the charge cannot be queued', async () => {
      isQueueDown = true;

      await expect(
        intercept(
          respond({ data: { id: 'asset-1' } }),
          charge({ reservationId: 'reservation-queue-failure' }),
        ),
      ).rejects.toThrow('settlement queue unavailable');

      expect(releasedHolds).toEqual(['reservation-queue-failure']);
    });
  });

  describe('charge identity', () => {
    it('settles a reserved charge once however often it is settled', async () => {
      const config = charge({ amount: 4, reservationId: 'reservation-7' });

      await settle(config, { data: { id: 'asset-1' } });
      await settle(config, { data: { id: 'asset-1' } });

      expect(jobs.map(({ id }) => id)).toEqual([
        'credit-deduct-org-1-credit-settle-reservation-7',
      ]);
    });

    it('gives each unreserved settlement its own job, even in the same millisecond', async () => {
      const config = charge({ amount: 4 });

      await settle(config);
      await settle(config);

      expect(jobs).toHaveLength(2);
      expect(jobs[0]?.id).not.toBe(jobs[1]?.id);
    });

    it('keys BYOK usage by its reservation the same way', async () => {
      await settle(charge({ isByokBypass: true }));
      await settle(charge({ isByokBypass: true, reservationId: 'r-8' }));
      await settle(charge({ isByokBypass: true, reservationId: 'r-8' }));

      expect(jobs.map(({ data }) => data.idempotencyKey)).toEqual([
        expect.stringMatching(/^byok-usage:/),
        'byok-usage:r-8',
      ]);
    });
  });

  describe('failed requests', () => {
    it('releases the hold and charges nothing', async () => {
      await expect(
        intercept(
          fail(new Error('Operation failed')),
          charge({ reservationId: 'reservation-1' }),
        ),
      ).rejects.toThrow('Operation failed');

      expect(jobs).toEqual([]);
      expect(releasedHolds).toEqual(['reservation-1']);
    });

    it('still surfaces the failure when the hold cannot be released', async () => {
      isWalletDown = true;

      await expect(
        intercept(
          fail(new Error('Operation failed')),
          charge({ reservationId: 'reservation-1' }),
        ),
      ).rejects.toThrow('Operation failed');

      expect(errors).toEqual(['Credit reservation release failed']);
    });

    it('charges a failure that already incurred a known provider cost', async () => {
      await expect(
        intercept(
          fail(
            Object.assign(new Error('blocked after render'), {
              isBillableFailure: true,
            }),
          ),
          charge({ reservationId: 'reservation-2' }),
        ),
      ).rejects.toThrow('blocked after render');

      expect(jobs.map(({ data }) => data.idempotencyKey)).toEqual([
        'credit-settle:reservation-2',
      ]);
      expect(releasedHolds).toEqual([]);
    });

    it('releases a billable failure whose charge cannot be queued', async () => {
      isQueueDown = true;

      await expect(
        intercept(
          fail(
            Object.assign(new Error('blocked'), { isBillableFailure: true }),
          ),
          charge({ reservationId: 'reservation-3' }),
        ),
      ).rejects.toThrow('blocked');

      expect(releasedHolds).toEqual(['reservation-3']);
      expect(errors).toEqual([
        'Known-cost charge for a failed request could not be queued',
      ]);
    });
  });

  describe('completion-settled routes', () => {
    const completion = (fields: Partial<DeferredCreditsConfig> = {}) =>
      charge({
        description: 'Image generation',
        reservationId: 'pool-1',
        settlement: 'completion',
        source: ActivitySource.IMAGE_GENERATION,
        ...fields,
      });
    const frozenQuote = () =>
      completion({
        boundOutputCount: 1,
        modelQuote: quote.status === 'priced' ? quote.snapshot : undefined,
      });

    it.each([
      ['success', respond()],
      ['failure', fail(new Error('second submission failed'))],
    ])(
      'closes the frozen group dispatch on HTTP %s without releasing accepted funding',
      async (_case, handler) => {
        await intercept(handler, frozenQuote()).catch(() => undefined);

        expect(closedGroups).toEqual(['pool-1']);
        expect(releasedHolds).toEqual([]);
        expect(jobs).toEqual([]);
      },
    );

    it('queues nothing on the response and releases only what no output claimed', async () => {
      await intercept(respond(), completion({ boundOutputCount: 1 }));

      expect(jobs).toEqual([]);
      expect(releasedHolds).toEqual(['pool-1']);
      expect(warnings).toEqual([]);
    });

    it('releases the whole hold and warns when no output was accepted', async () => {
      await intercept(respond(), completion());

      expect(releasedHolds).toEqual(['pool-1']);
      expect(warnings).toEqual([
        'Completion-settled request bound no output; releasing its hold',
      ]);
    });

    it.each([
      ['succeeds', respond()],
      ['later fails', fail(new Error('gateway timeout'))],
    ])(
      'keeps the hold open while the service is still binding outputs and the request %s',
      async (_case, handler) => {
        await intercept(
          handler,
          completion({ boundOutputCount: 1, isPoolReleaseDeferred: true }),
        ).catch(() => undefined);

        expect(releasedHolds).toEqual([]);
        expect(jobs).toEqual([]);
      },
    );

    it('releases the request hold when the request fails before any deferral', async () => {
      await expect(
        intercept(fail(new Error('provider rejected')), completion()),
      ).rejects.toThrow('provider rejected');

      expect(releasedHolds).toEqual(['pool-1']);
    });

    it('leaves BYOK completion usage to the linked output receipt', async () => {
      await intercept(
        respond(),
        completion({ isByokBypass: true, reservationId: undefined }),
      );

      expect(jobs).toEqual([]);
      expect(releasedHolds).toEqual([]);
    });
  });
});
