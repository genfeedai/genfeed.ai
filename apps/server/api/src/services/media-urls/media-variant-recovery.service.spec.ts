import { MediaDerivativePreparationService } from '@api/services/media-urls/media-derivative-preparation.service';
import {
  MEDIA_RECOVERY_EXHAUSTED_FAILURE_CODE,
  MEDIA_VARIANT_MAX_RECOVERY_ATTEMPTS,
  MEDIA_VARIANT_RETRY_BASE_MS,
  MEDIA_VARIANT_STALE_PENDING_MS,
} from '@api/services/media-urls/media-recovery.constants';
import { MediaVariantRecoveryService } from '@api/services/media-urls/media-variant-recovery.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const now = new Date('2026-10-23T12:00:00.000Z');

function variant(overrides: Record<string, unknown> = {}) {
  return {
    attemptCount: 0,
    id: testId('variant', 1),
    ingredientId: testId('ingredient', 1),
    organizationId: testId('org', 1),
    purpose: 'public-share',
    sourceIdentity: 'identity-1',
    state: 'PENDING',
    updatedAt: new Date(now.getTime() - MEDIA_VARIANT_STALE_PENDING_MS - 1),
    ...overrides,
  };
}

async function setup() {
  const prisma = {
    mediaDeliveryVariant: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const preparation = {
    addPrepareJob: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const module = await Test.createTestingModule({
    providers: [
      MediaVariantRecoveryService,
      { provide: PrismaService, useValue: prisma },
      { provide: MediaDerivativePreparationService, useValue: preparation },
      { provide: LoggerService, useValue: logger },
    ],
  }).compile();
  return {
    logger,
    preparation,
    prisma,
    service: module.get(MediaVariantRecoveryService),
  };
}

describe('MediaVariantRecoveryService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing while derivative preparation is disabled', async () => {
    const { service, prisma, preparation } = await setup();
    preparation.isEnabled.mockReturnValue(false);
    await expect(service.recover(now)).resolves.toEqual({
      exhausted: 0,
      requeued: 0,
      retried: 0,
    });
    expect(prisma.mediaDeliveryVariant.findMany).not.toHaveBeenCalled();
    expect(prisma.mediaDeliveryVariant.updateMany).not.toHaveBeenCalled();
  });

  it('re-enqueues a stale PENDING variant under its durable job id after claiming it', async () => {
    const { service, prisma, preparation } = await setup();
    prisma.mediaDeliveryVariant.findMany
      .mockResolvedValueOnce([variant()])
      .mockResolvedValueOnce([]);
    prisma.mediaDeliveryVariant.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const totals = await service.recover(now);

    expect(totals).toEqual({ exhausted: 0, requeued: 1, retried: 0 });
    expect(prisma.mediaDeliveryVariant.updateMany).toHaveBeenLastCalledWith({
      data: {
        attemptCount: { increment: 1 },
        failureCode: null,
        state: 'PENDING',
      },
      where: {
        attemptCount: 0,
        id: testId('variant', 1),
        isDeleted: false,
        organizationId: testId('org', 1),
        state: 'PENDING',
      },
    });
    expect(preparation.addPrepareJob).toHaveBeenCalledWith(
      testId('variant', 1),
      {
        ingredientId: testId('ingredient', 1),
        organizationId: testId('org', 1),
        purpose: 'public-share',
        sourceIdentity: 'identity-1',
      },
    );
  });

  it('only queries stale, in-budget PENDING variants for renderable purposes', async () => {
    const { service, prisma } = await setup();
    await service.recover(now);
    expect(prisma.mediaDeliveryVariant.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          attemptCount: { lt: MEDIA_VARIANT_MAX_RECOVERY_ATTEMPTS },
          isDeleted: false,
          purpose: { in: ['public-share', 'public-og'] },
          state: 'PENDING',
          updatedAt: {
            lt: new Date(now.getTime() - MEDIA_VARIANT_STALE_PENDING_MS),
          },
        }),
      }),
    );
  });

  it('does not enqueue when another sweep already claimed the variant', async () => {
    const { service, prisma, preparation } = await setup();
    prisma.mediaDeliveryVariant.findMany
      .mockResolvedValueOnce([variant()])
      .mockResolvedValueOnce([]);
    prisma.mediaDeliveryVariant.updateMany.mockResolvedValue({ count: 0 });
    const totals = await service.recover(now);
    expect(totals.requeued).toBe(0);
    expect(preparation.addPrepareJob).not.toHaveBeenCalled();
  });

  it('retries the FAILED variants the backoff query returns', async () => {
    const { service, prisma, preparation } = await setup();
    const due = variant({
      attemptCount: 1,
      id: testId('variant', 2),
      state: 'FAILED',
      updatedAt: new Date(
        now.getTime() - MediaVariantRecoveryService.retryDelayMs(1) - 1,
      ),
    });
    prisma.mediaDeliveryVariant.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([due]);
    prisma.mediaDeliveryVariant.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });

    const totals = await service.recover(now);

    expect(totals).toEqual({ exhausted: 0, requeued: 0, retried: 1 });
    expect(preparation.addPrepareJob).toHaveBeenCalledTimes(1);
    expect(preparation.addPrepareJob).toHaveBeenCalledWith(
      testId('variant', 2),
      expect.objectContaining({ purpose: 'public-share' }),
    );
  });

  it('keeps exhausted FAILED variants out of the retry query', async () => {
    const { service, prisma } = await setup();
    await service.recover(now);
    expect(prisma.mediaDeliveryVariant.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { failureCode: null },
                {
                  failureCode: { not: MEDIA_RECOVERY_EXHAUSTED_FAILURE_CODE },
                },
              ],
            },
            {
              OR: Array.from(
                { length: MEDIA_VARIANT_MAX_RECOVERY_ATTEMPTS },
                (_, attemptCount) => ({
                  attemptCount,
                  updatedAt: {
                    lte: new Date(
                      now.getTime() -
                        MediaVariantRecoveryService.retryDelayMs(attemptCount),
                    ),
                  },
                }),
              ),
            },
          ],
          state: 'FAILED',
        }),
      }),
    );
  });

  it('fails out-of-budget stale PENDING variants and reports them once to Sentry', async () => {
    const { service, prisma } = await setup();
    prisma.mediaDeliveryVariant.updateMany.mockResolvedValueOnce({ count: 3 });
    const totals = await service.recover(now);
    expect(totals.exhausted).toBe(3);
    expect(prisma.mediaDeliveryVariant.updateMany).toHaveBeenNthCalledWith(1, {
      data: {
        failureCode: MEDIA_RECOVERY_EXHAUSTED_FAILURE_CODE,
        state: 'FAILED',
      },
      where: {
        attemptCount: { gte: MEDIA_VARIANT_MAX_RECOVERY_ATTEMPTS },
        isDeleted: false,
        OR: [
          {
            state: 'PENDING',
            updatedAt: {
              lt: new Date(now.getTime() - MEDIA_VARIANT_STALE_PENDING_MS),
            },
          },
          {
            OR: [
              { failureCode: null },
              { failureCode: { not: MEDIA_RECOVERY_EXHAUSTED_FAILURE_CODE } },
            ],
            state: 'FAILED',
            updatedAt: {
              lt: new Date(now.getTime() - MEDIA_VARIANT_RETRY_BASE_MS),
            },
          },
        ],
      },
    });
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'Media delivery recovery gave up on variants',
      expect.objectContaining({
        extra: { exhausted: 3 },
        tags: { area: 'media-delivery-recovery' },
      }),
    );
  });

  it('skips public-social variants and survives a failing enqueue', async () => {
    const { service, prisma, preparation, logger } = await setup();
    prisma.mediaDeliveryVariant.findMany
      .mockResolvedValueOnce([
        variant({ purpose: 'public-social' }),
        variant({ id: testId('variant', 4) }),
        variant({ id: testId('variant', 5) }),
      ])
      .mockResolvedValueOnce([]);
    prisma.mediaDeliveryVariant.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });
    preparation.addPrepareJob
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValueOnce(undefined);

    const totals = await service.recover(now);

    expect(totals.requeued).toBe(1);
    expect(preparation.addPrepareJob).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: {
        area: 'media-delivery-recovery',
        variantId: testId('variant', 4),
      },
    });
  });
});
