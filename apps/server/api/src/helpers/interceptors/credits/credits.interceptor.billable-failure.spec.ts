import { BrandedGenerationBlockedException } from '@api/helpers/exceptions/branded-generation-blocked/branded-generation-blocked.exception';
import {
  CreditsInterceptor,
  type CreditsInterceptorRequest,
} from '@api/helpers/interceptors/credits/credits.interceptor';
import { isBillableFailure } from '@api/helpers/utils/credits/billable-failure.util';
import { ActivitySource } from '@genfeedai/contracts';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const user = { id: 'user_1', organizationId: 'org-1', userId: 'user-1' };

function setup(config: Record<string, unknown>) {
  const queue = {
    queueByokUsage: vi.fn().mockResolvedValue(undefined),
    queueDeduction: vi.fn().mockResolvedValue(undefined),
  };
  const credits = { releaseReservation: vi.fn().mockResolvedValue(undefined) };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const interceptor = new CreditsInterceptor(
    queue as never,
    credits as never,
    logger as never,
    { closeDispatch: vi.fn() } as never,
  );
  const request: CreditsInterceptorRequest = {
    creditsConfig:
      config as unknown as CreditsInterceptorRequest['creditsConfig'],
    user: user as never,
  };
  const run = (error: unknown) =>
    lastValueFrom(
      interceptor.intercept(
        {
          switchToHttp: () => ({ getRequest: () => request }),
        } as ExecutionContext,
        { handle: () => throwError(() => error) } as CallHandler,
      ),
    );
  return { credits, logger, queue, run };
}

const finalized = {
  amount: 3,
  deferred: false,
  description: 'Draft',
  reservationId: 'hold-1',
  source: ActivitySource.POST_GENERATION,
};
const billable = () =>
  new BrandedGenerationBlockedException(422, 'channel_limit_exceeded', 'r-1', {
    model: 'm',
  });

describe('CreditsInterceptor failures', () => {
  beforeEach(() => vi.clearAllMocks());

  it('charges the finalized known cost of a failure that reached the provider', async () => {
    const { credits, queue, run } = setup(finalized);
    const error = billable();

    await expect(run(error)).rejects.toBe(error);

    expect(queue.queueDeduction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 3,
        reservationId: 'hold-1',
        type: 'deduct-credits',
        userId: 'user-1',
      }),
    );
    expect(credits.releaseReservation).not.toHaveBeenCalled();
  });

  it('releases the reservation for a failure that never reached the provider', async () => {
    const { credits, queue, run } = setup(finalized);
    const error = new BrandedGenerationBlockedException(
      409,
      'no_revision',
      'r-1',
    );

    await expect(run(error)).rejects.toBe(error);

    expect(queue.queueDeduction).not.toHaveBeenCalled();
    expect(credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'hold-1',
    });
  });

  it('releases an unfinalized (still deferred) charge even for a billable failure', async () => {
    const { credits, queue, run } = setup({ ...finalized, deferred: true });
    await expect(run(billable())).rejects.toBeInstanceOf(
      BrandedGenerationBlockedException,
    );
    expect(queue.queueDeduction).not.toHaveBeenCalled();
    expect(credits.releaseReservation).toHaveBeenCalledTimes(1);
  });

  it('falls back to releasing the hold when the charge cannot be queued, and still rethrows the original failure', async () => {
    const { credits, logger, queue, run } = setup(finalized);
    queue.queueDeduction.mockRejectedValue(new Error('redis down'));
    const error = billable();

    await expect(run(error)).rejects.toBe(error);

    expect(logger.error).toHaveBeenCalled();
    expect(credits.releaseReservation).toHaveBeenCalledTimes(1);
  });

  it('does not treat an ordinary error as billable', async () => {
    const { credits, queue, run } = setup(finalized);
    await expect(run(new Error('boom'))).rejects.toThrow('boom');
    expect(queue.queueDeduction).not.toHaveBeenCalled();
    expect(credits.releaseReservation).toHaveBeenCalledTimes(1);
  });
});

describe('isBillableFailure', () => {
  it('is true only for errors that carry a provider attempt', () => {
    expect(isBillableFailure(billable())).toBe(true);
    expect(
      isBillableFailure(new BrandedGenerationBlockedException(409, 'x', 'r')),
    ).toBe(false);
    expect(isBillableFailure(new Error('x'))).toBe(false);
    expect(isBillableFailure(null)).toBe(false);
    expect(isBillableFailure('isBillableFailure')).toBe(false);
  });
});
