import { LiveSessionCreditsService } from '@api/collections/videos/services/live-session-credits.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  LiveSessionStatus,
  LiveSessionTerminateReason,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IReserveCreditsInput } from '@genfeedai/contracts/interfaces/billing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const directorPricing = {
  cost: 400,
  costPerUnit: 27,
  minCost: 400,
  pricingType: 'per-second',
  provider: 'fal',
  providerCostUsd: 0.08,
};

const user = {
  brandId: 'brand-1',
  id: 'user-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function deferredCreditsRequest() {
  return {
    creditsConfig: {
      deferred: true,
      description: 'Live session',
    },
    user,
  };
}

function openSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    brandId: 'brand-1',
    ceilingEndsAt: new Date('2026-09-18T12:15:00.000Z'),
    ceilingSeconds: 900,
    elapsedSeconds: null,
    id: 'session-1',
    isByokBypass: false,
    isDeleted: false,
    modelKey: MODEL_KEYS.FAL_MINIMAX_H3_MAX_DIRECTOR,
    organizationId: 'org-1',
    reservationId: 'reservation-1',
    reservedCredits: 24_300,
    resolution: '768P',
    settledCredits: null,
    startedAt: new Date('2026-09-18T12:00:00.000Z'),
    status: LiveSessionStatus.OPEN,
    terminateReason: null,
    terminatedAt: null,
    userId: 'user-1',
    ...overrides,
  };
}

describe('LiveSessionCreditsService', () => {
  const prisma = {
    liveSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
    releaseReservation: vi.fn(),
    reserveCredits: vi.fn(),
    settleReservation: vi.fn(),
  };
  const modelsService = {
    findOne: vi.fn(),
  };
  const byokService = {
    isByokActiveForProvider: vi.fn(),
    isByokBillingInGoodStanding: vi.fn(),
  };

  let service: LiveSessionCreditsService;

  beforeEach(() => {
    vi.clearAllMocks();
    modelsService.findOne.mockResolvedValue(directorPricing);
    byokService.isByokActiveForProvider.mockResolvedValue(false);
    byokService.isByokBillingInGoodStanding.mockResolvedValue(true);
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );
    creditsUtilsService.reserveCredits.mockImplementation(
      (input: IReserveCreditsInput) =>
        Promise.resolve({
          amount: input.amount,
          id: 'reservation-1',
          status: 'RESERVED',
        }),
    );
    creditsUtilsService.settleReservation.mockResolvedValue({});
    creditsUtilsService.releaseReservation.mockResolvedValue({});
    prisma.liveSession.create.mockImplementation(({ data }) =>
      Promise.resolve(openSessionRow(data)),
    );
    prisma.liveSession.findFirst.mockResolvedValue(openSessionRow());
    prisma.liveSession.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...openSessionRow(), ...data }),
    );
    service = new LiveSessionCreditsService(
      prisma as never,
      creditsUtilsService as never,
      modelsService as never,
      byokService as never,
    );
  });

  it('reserves ceiling credits before persisting a session', async () => {
    const request = deferredCreditsRequest();

    const session = await service.openSession({
      dto: {
        ceilingSeconds: 900,
        model: MODEL_KEYS.FAL_MINIMAX_H3_MAX_DIRECTOR,
        resolution: '768P',
      },
      now: new Date('2026-09-18T12:00:00.000Z'),
      request,
      user: user as never,
    });

    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 24_300,
        expiresAt: new Date('2026-09-18T12:15:00.000Z'),
        organizationId: 'org-1',
        workloadType: 'live-session',
      }),
    );
    expect(prisma.liveSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ceilingSeconds: 900,
          reservationId: 'reservation-1',
          reservedCredits: 24_300,
        }),
      }),
    );
    expect(request.creditsConfig).toMatchObject({
      deferred: true,
      reservationId: 'reservation-1',
    });
    expect(session.reservationId).toBe('reservation-1');
  });

  it('applies the 1080P resolution multiplier to the reserved ceiling', async () => {
    const request = deferredCreditsRequest();

    await service.openSession({
      dto: {
        ceilingSeconds: 900,
        model: MODEL_KEYS.FAL_MINIMAX_H3_MAX_DIRECTOR,
        resolution: '1080P',
      },
      now: new Date('2026-09-18T12:00:00.000Z'),
      request,
      user: user as never,
    });

    expect(creditsUtilsService.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 48_600 }),
    );
  });

  it('refuses to open when the ceiling cannot be reserved', async () => {
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      false,
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(10);
    const request = deferredCreditsRequest();

    const error = await service
      .openSession({
        dto: {
          ceilingSeconds: 900,
          model: MODEL_KEYS.FAL_MINIMAX_H3_MAX_DIRECTOR,
        },
        request,
        user: user as never,
      })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    expect(prisma.liveSession.create).not.toHaveBeenCalled();
  });

  it('does not persist a session when reserveCredits fails', async () => {
    creditsUtilsService.reserveCredits.mockRejectedValue(
      new BusinessLogicException(
        'Insufficient credits',
        { available: 1, required: 24_300 },
        'INSUFFICIENT_CREDITS',
      ),
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(1);
    const request = deferredCreditsRequest();

    const error = await service
      .openSession({
        dto: {
          ceilingSeconds: 900,
          model: MODEL_KEYS.FAL_MINIMAX_H3_MAX_DIRECTOR,
        },
        request,
        user: user as never,
      })
      .catch((caught) => caught);

    expect(error.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(prisma.liveSession.create).not.toHaveBeenCalled();
  });

  it('settles elapsed time and releases the unused reservation on early stop', async () => {
    await service.terminateSession({
      now: new Date('2026-09-18T12:00:10.000Z'),
      organizationId: 'org-1',
      reason: LiveSessionTerminateReason.USER,
      sessionId: 'session-1',
      userId: 'user-1',
    });

    expect(creditsUtilsService.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: 400,
        reservationId: 'reservation-1',
      }),
    );
    expect(prisma.liveSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          elapsedSeconds: 10,
          settledCredits: 400,
          status: LiveSessionStatus.TERMINATED,
          terminateReason: LiveSessionTerminateReason.USER,
        }),
      }),
    );
  });

  it('terminates at the declared ceiling and bills the reserved quantity', async () => {
    await service.terminateSession({
      now: new Date('2026-09-18T12:15:00.000Z'),
      organizationId: 'org-1',
      sessionId: 'session-1',
      userId: 'user-1',
    });

    expect(creditsUtilsService.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 24_300 }),
    );
    expect(prisma.liveSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          elapsedSeconds: 900,
          terminateReason: LiveSessionTerminateReason.CEILING,
        }),
      }),
    );
  });

  it('auto-terminates an open session once the ceiling has elapsed', async () => {
    await service.getSession({
      now: new Date('2026-09-18T12:16:00.000Z'),
      organizationId: 'org-1',
      sessionId: 'session-1',
      userId: 'user-1',
    });

    expect(creditsUtilsService.settleReservation).toHaveBeenCalled();
    expect(prisma.liveSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          terminateReason: LiveSessionTerminateReason.CEILING,
        }),
      }),
    );
  });
});
