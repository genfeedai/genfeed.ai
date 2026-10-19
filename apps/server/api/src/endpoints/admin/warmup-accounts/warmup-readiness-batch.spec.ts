import { warmupReadinessBatch } from '@api/endpoints/admin/warmup-accounts/warmup-workspace';
import type { Prisma, WarmupAccount } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

function makeAccount(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    auditEvents: [],
    brandId: `brand-${suffix}`,
    customerUserId: `customer-${suffix}`,
    diagnostics: {
      preparation: {
        articleId: `article-${suffix}`,
        assetId: `asset-${suffix}`,
        contextReviewedAt: '2026-09-08',
        grant: {
          actorUserId: 'operator-1',
          amount: 500,
          grantedAt: '2026-09-08',
          reason: 'Evaluation',
          transactionId: `grant-${suffix}`,
        },
      },
      steps: [],
    },
    id: `warmup-${suffix}`,
    operatorUserId: 'operator-1',
    organizationId: `org-${suffix}`,
    status: 'INVITED',
    ...overrides,
  } as unknown as WarmupAccount;
}

function rowsFor(suffix: string) {
  return {
    article: {
      brandId: `brand-${suffix}`,
      id: `article-${suffix}`,
      organizationId: `org-${suffix}`,
      userId: 'operator-1',
    },
    asset: {
      id: `asset-${suffix}`,
      parentBrandId: `brand-${suffix}`,
      parentOrgId: `org-${suffix}`,
      userId: 'operator-1',
    },
    balance: {
      balance: 500,
      billingAccountId: `billing-${suffix}`,
      heldAmount: 0,
      organizationId: `org-${suffix}`,
    },
    billing: { id: `billing-${suffix}` },
    brand: {
      id: `brand-${suffix}`,
      organizationId: `org-${suffix}`,
      slug: `brand-${suffix}`,
    },
    grant: {
      amount: 500,
      billingAccountId: `billing-${suffix}`,
      id: `grant-${suffix}`,
      idempotencyKey: `warmup:warmup-${suffix}:grant`,
      organizationId: `org-${suffix}`,
    },
    link: {
      billingAccountId: `billing-${suffix}`,
      organizationId: `org-${suffix}`,
    },
    organization: {
      billingAccountId: `billing-${suffix}`,
      id: `org-${suffix}`,
      slug: `org-${suffix}`,
    },
    owner: {
      billingAccountId: `billing-${suffix}`,
      userId: `customer-${suffix}`,
    },
    setting: { id: `setting-${suffix}`, userId: `customer-${suffix}` },
    settings: { id: `os-${suffix}`, organizationId: `org-${suffix}` },
  };
}

function fixture(
  suffixes: string[],
  mutate?: (rows: Record<string, ReturnType<typeof rowsFor>>) => void,
) {
  const rows = Object.fromEntries(
    suffixes.map((suffix) => [suffix, rowsFor(suffix)]),
  );
  mutate?.(rows);
  const all = Object.values(rows);
  const delegate = (pick: (row: ReturnType<typeof rowsFor>) => unknown) => ({
    findFirst: vi.fn(),
    findMany: vi.fn().mockResolvedValue(all.map(pick).filter(Boolean)),
  });
  const tx = {
    article: delegate((row) => row.article),
    asset: delegate((row) => row.asset),
    billingAccount: delegate((row) => row.billing),
    billingAccountMember: delegate((row) => row.owner),
    billingAccountOrganization: delegate((row) => row.link),
    brand: delegate((row) => row.brand),
    creditBalance: delegate((row) => row.balance),
    creditTransaction: delegate((row) => row.grant),
    organization: delegate((row) => row.organization),
    organizationSetting: delegate((row) => row.settings),
    setting: delegate((row) => row.setting),
  };
  return { client: tx as unknown as Prisma.TransactionClient, tx };
}

describe('warmupReadinessBatch', () => {
  it('looks every dependency up once for the whole page, never per account', async () => {
    const { client, tx } = fixture(['a', 'b', 'c']);

    const result = await warmupReadinessBatch(client, [
      makeAccount('a'),
      makeAccount('b'),
      makeAccount('c'),
    ]);

    expect(result.map((entry) => entry.ready)).toEqual([true, true, true]);
    for (const delegate of Object.values(tx)) {
      expect(delegate.findFirst).not.toHaveBeenCalled();
      expect(delegate.findMany).toHaveBeenCalledTimes(1);
    }
    expect(tx.organization.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['org-a', 'org-b', 'org-c'] },
        isDeleted: false,
      },
    });
    expect(tx.asset.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: ['asset-a', 'asset-b', 'asset-c'] },
        isDeleted: false,
        parentType: 'BRAND',
        userId: { in: ['operator-1'] },
      }),
    });
    expect(result[0]).toMatchObject({
      availableCredits: 500,
      workspacePath: '/org-a/brand-a',
    });
  });

  it('only counts rows that belong to the account that owns them', async () => {
    const { client } = fixture(['a', 'b'], (rows) => {
      // b's asset lives in a's brand, b's grant ledger row has the wrong key
      // and a's wallet is held by a pending generation.
      rows.b.asset.parentBrandId = 'brand-a';
      rows.b.grant.idempotencyKey = 'warmup:other:grant';
      rows.a.balance.heldAmount = 5;
    });

    const [first, second] = await warmupReadinessBatch(client, [
      makeAccount('a'),
      makeAccount('b'),
    ]);

    expect(first.availableCredits).toBe(495);
    expect(first.blockers).toEqual([
      'Reconcile preparation costs to restore handoff credits',
      'Wait for outstanding generation reservations',
    ]);
    expect(second.blockers).toEqual([
      'Repair the promotional grant ledger entry',
      'Prepare one completed private starter asset',
    ]);
  });

  it('keeps accounts without a workspace blocked without querying for them', async () => {
    const { client, tx } = fixture(['a']);

    const result = await warmupReadinessBatch(client, [
      makeAccount('x', { organizationId: null }),
      makeAccount('a'),
    ]);

    expect(result[0]).toEqual({
      availableCredits: 0,
      blockers: ['Repair workspace resources'],
      ready: false,
    });
    expect(result[1].ready).toBe(true);
    expect(tx.organization.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['org-a'] }, isDeleted: false },
    });
  });

  it('issues no queries for an empty page', async () => {
    const { client, tx } = fixture([]);

    expect(await warmupReadinessBatch(client, [])).toEqual([]);
    expect(tx.organization.findMany).not.toHaveBeenCalled();
  });
});
