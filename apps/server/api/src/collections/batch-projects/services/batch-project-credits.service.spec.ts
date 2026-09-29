import { BatchProjectCreditsService } from '@api/collections/batch-projects/services/batch-project-credits.service';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import type { IBatchProjectItemDispatch } from '@genfeedai/contracts/interfaces';
import { ConflictException } from '@nestjs/common';

const dispatch: IBatchProjectItemDispatch = {
  attempt: 1,
  billingMode: 'platform',
  credits: 8,
  key: 'batch-project-item:item-1:dispatch:1',
  model: 'heygen-avatar',
  state: 'queued',
};

describe('BatchProjectCreditsService', () => {
  const credits = {
    releaseReservation: vi.fn(),
    reserveCredits: vi.fn(),
    settleReservation: vi.fn(),
  };
  const service = new BatchProjectCreditsService(credits as never);

  beforeEach(() => vi.clearAllMocks());

  it('holds a paid line under its dispatch key', async () => {
    credits.reserveCredits.mockResolvedValue({
      id: 'reservation-1',
      status: CreditReservationStatus.RESERVED,
    });

    await expect(
      service.reserve({
        actorUserId: 'user-1',
        dispatch,
        organizationId: 'org-1',
      }),
    ).resolves.toBe('reservation-1');
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 8,
        idempotencyKey: dispatch.key,
        workloadType: 'batch-project-idea',
      }),
    );
  });

  it('never reuses a refunded hold', async () => {
    credits.reserveCredits.mockResolvedValue({
      id: 'reservation-1',
      status: CreditReservationStatus.RELEASED,
    });

    await expect(
      service.reserve({
        actorUserId: 'user-1',
        dispatch,
        organizationId: 'org-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('never touches platform credits for a BYOK line', async () => {
    const byok = { ...dispatch, billingMode: 'byok' as const, credits: 0 };

    await service.reserve({
      actorUserId: 'user-1',
      dispatch: byok,
      organizationId: 'org-1',
    });
    await expect(
      service.settle({
        actorUserId: 'user-1',
        description: 'Batch idea',
        dispatch: byok,
        organizationId: 'org-1',
        source: ActivitySource.VIDEO_GENERATION,
      }),
    ).resolves.toBe('settled');
    await service.release({ dispatch: byok, organizationId: 'org-1' });

    expect(credits.reserveCredits).not.toHaveBeenCalled();
    expect(credits.settleReservation).not.toHaveBeenCalled();
    expect(credits.releaseReservation).not.toHaveBeenCalled();
  });

  it('charges exactly the accepted line on settlement', async () => {
    await service.settle({
      actorUserId: 'user-1',
      description: 'Batch idea video generation',
      dispatch: {
        ...dispatch,
        reservationId: 'reservation-1',
        state: 'reserved',
      },
      organizationId: 'org-1',
      source: ActivitySource.VIDEO_GENERATION,
    });

    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: 8,
        organizationId: 'org-1',
        reservationId: 'reservation-1',
      }),
    );
  });

  it('reports an expired hold as released instead of charging', async () => {
    credits.settleReservation.mockRejectedValue(
      new UnsettleableReservationException('EXPIRED'),
    );

    await expect(
      service.settle({
        actorUserId: 'user-1',
        description: 'Batch idea',
        dispatch: { ...dispatch, reservationId: 'reservation-1' },
        organizationId: 'org-1',
        source: ActivitySource.VIDEO_GENERATION,
      }),
    ).resolves.toBe('released');
  });
});
