import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationCreditsController } from '@api/endpoints/admin/organization-credits/organization-credits.controller';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

function createService() {
  return {
    addOrganizationCreditsWithExpiration: vi.fn().mockResolvedValue(undefined),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(500),
  };
}

const ledgerRow = {
  actorUserId: 'user-1',
  amount: -1,
  balanceAfter: 97_757,
  brandId: 'brand-1',
  category: 'deduct',
  createdAt: new Date('2026-10-27T07:41:00.000Z'),
  description: 'Agent LLM round',
  id: 'tx-1',
  idempotencyKey: 'reservation-settle-1',
  metadata: { cardKey: 'hashed-card', model: 'deepseek' },
  organizationId: 'org-1',
  referenceId: 'res-1',
  referenceType: 'credit_reservation',
  reservationId: 'res-1',
  source: 'agent-chat',
  workflowExecutionId: null,
  workflowNodeId: null,
};

function createTransactions(rows: unknown[] = [ledgerRow]) {
  return { getOrganizationTransactions: vi.fn().mockResolvedValue(rows) };
}

const ledgerRequest = {
  originalUrl: '/v1/admin/organizations/org-1/credits/ledger',
} as never;

describe('admin organization credit grant', () => {
  it('requires both IP allow-list and platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminOrganizationCreditsController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('grants credits to the path organization and reports the balance', async () => {
    const service = createService();
    const controller = new AdminOrganizationCreditsController(
      service as never,
      createTransactions() as never,
    );
    const result = await controller.grant(
      { context: { userId: 'operator' } } as never,
      'org-1',
      {
        amount: 500,
        idempotencyKey: 'grant-org-1-500',
        reason: 'Onboarding grant',
      },
    );

    expect(service.addOrganizationCreditsWithExpiration).toHaveBeenCalledWith(
      'org-1',
      500,
      'admin-grant',
      'Onboarding grant',
      expect.any(Date),
      { actorUserId: 'operator', idempotencyKey: 'grant-org-1-500' },
    );
    expect(result.data).toMatchObject({
      balance: 500,
      creditsGranted: 500,
      organizationId: 'org-1',
    });
  });

  it('rejects bad amounts, missing reasons and unknown fields before any ledger write', async () => {
    const service = createService();
    const controller = new AdminOrganizationCreditsController(
      service as never,
      createTransactions() as never,
    );
    const request = { context: { userId: 'operator' } } as never;
    for (const body of [
      { amount: 0, reason: 'Onboarding grant' },
      { amount: -5, reason: 'Onboarding grant' },
      { amount: 1.5, reason: 'Onboarding grant' },
      { amount: 500 },
      { amount: 500, reason: 'short' },
      { amount: 500, organizationId: 'other', reason: 'Onboarding grant' },
    ]) {
      await expect(controller.grant(request, 'org-1', body)).rejects.toThrow();
    }
    expect(service.addOrganizationCreditsWithExpiration).not.toHaveBeenCalled();
  });

  it('rejects a missing operator identity', async () => {
    const service = createService();
    const controller = new AdminOrganizationCreditsController(
      service as never,
      createTransactions() as never,
    );
    await expect(
      controller.grant({} as never, 'org-1', {
        amount: 500,
        reason: 'Onboarding grant',
      }),
    ).rejects.toThrow();
    expect(service.addOrganizationCreditsWithExpiration).not.toHaveBeenCalled();
  });
});

describe('admin organization credit ledger', () => {
  it('returns each row with its actor, brand and reservation, without abuse-check metadata', async () => {
    const controller = new AdminOrganizationCreditsController(
      createService() as never,
      createTransactions() as never,
    );

    const result = await controller.ledger(ledgerRequest, 'org-1', {
      from: '2026-10-27T07:00:00Z',
      to: '2026-10-27T08:30:00Z',
    });

    expect(result).toMatchObject({
      data: [
        {
          attributes: {
            actorUserId: 'user-1',
            amount: -1,
            balanceAfter: 97_757,
            brandId: 'brand-1',
            description: 'Agent LLM round',
            metadata: { model: 'deepseek' },
            reservationId: 'res-1',
            source: 'agent-chat',
          },
          id: 'tx-1',
          type: 'admin-credit-ledger-entry',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('hashed-card');
    expect(JSON.stringify(result)).not.toContain('reservation-settle-1');
  });

  it('reads only the requested window of the path organization', async () => {
    const transactions = createTransactions([]);
    const controller = new AdminOrganizationCreditsController(
      createService() as never,
      transactions as never,
    );

    await controller.ledger(ledgerRequest, 'org-1', {
      from: '2026-10-27T07:00:00Z',
      limit: '50',
      to: '2026-10-27T08:30:00Z',
    });

    expect(transactions.getOrganizationTransactions).toHaveBeenCalledWith(
      'org-1',
      50,
      0,
      {
        createdFrom: new Date('2026-10-27T07:00:00Z'),
        createdTo: new Date('2026-10-27T08:30:00Z'),
      },
    );
  });

  it.each([
    ['a missing window', {}],
    ['a date without a time', { from: '2026-10-27', to: '2026-10-28' }],
    [
      'a reversed window',
      { from: '2026-10-27T08:30:00Z', to: '2026-10-27T07:00:00Z' },
    ],
    [
      'a window over 31 days',
      { from: '2026-09-01T00:00:00Z', to: '2026-10-27T00:00:00Z' },
    ],
    [
      'a limit over 500',
      {
        from: '2026-10-27T07:00:00Z',
        limit: '501',
        to: '2026-10-27T08:30:00Z',
      },
    ],
    [
      'an unknown filter',
      {
        from: '2026-10-27T07:00:00Z',
        organizationId: 'other',
        to: '2026-10-27T08:30:00Z',
      },
    ],
  ])('rejects %s', async (_case, query) => {
    const controller = new AdminOrganizationCreditsController(
      createService() as never,
      createTransactions() as never,
    );

    await expect(
      controller.ledger(ledgerRequest, 'org-1', query),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('admin organization credit usage', () => {
  const usageRequest = {
    originalUrl: '/v1/admin/organizations/org-1/credits/usage',
  } as never;
  const metrics = {
    breakdown: [{ amount: 12, count: 3, source: 'agent-chat' }],
    currentBalance: 88,
    dailySeries: [
      { amount: 5, date: '2026-11-04' },
      { amount: 7, date: '2026-11-05' },
    ],
    monthlySeries: [],
    trendPercentage: 0,
    usage30Days: 12,
    usage7Days: 12,
    weeklySeries: [],
  };

  // Answers only for org-1, and only inside org-1's tenant context.
  function createUsageTransactions() {
    return {
      getUsageMetrics: vi.fn(async (organizationId: string) => {
        if (
          organizationId !== 'org-1' ||
          getTenantContext()?.organizationId !== 'org-1'
        ) {
          throw new Error('read outside the path organization');
        }
        return metrics;
      }),
    };
  }

  it("returns the path organization's usage in its own tenant context", async () => {
    const controller = new AdminOrganizationCreditsController(
      createService() as never,
      createUsageTransactions() as never,
    );

    await expect(
      controller.usage(usageRequest, 'org-1'),
    ).resolves.toMatchObject({
      data: {
        attributes: {
          breakdown: [{ amount: 12, count: 3, source: 'agent-chat' }],
          dailySeries: [
            { amount: 5, date: '2026-11-04' },
            { amount: 7, date: '2026-11-05' },
          ],
          usage30Days: 12,
        },
        type: 'credit-usage',
      },
    });
  });

  it('rejects a blank organization id', async () => {
    const controller = new AdminOrganizationCreditsController(
      createService() as never,
      createUsageTransactions() as never,
    );

    await expect(controller.usage(usageRequest, '  ')).rejects.toThrow(
      BadRequestException,
    );
  });
});
