import {
  claimWarmupWorkspace,
  creditWarmupWallet,
  reconcileWarmupWorkspace,
  warmupReadiness,
} from '@api/endpoints/admin/warmup-accounts/warmup-workspace';
import type { Prisma, WarmupAccount } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const account = {
  id: 'warmup-1',
  organizationId: 'org-1',
  brandId: 'brand-1',
  customerUserId: 'customer-1',
  operatorUserId: 'operator-1',
  status: 'INVITED',
  invitationId: 'invite-1',
  auditEvents: [],
  diagnostics: {
    steps: [],
    preparation: {
      grant: {
        amount: 500,
        transactionId: 'grant-1',
        actorUserId: 'operator-1',
        grantedAt: '2026-09-08',
        reason: 'Evaluation',
      },
      contextReviewedAt: '2026-09-08',
      assetId: 'asset-1',
      articleId: 'article-1',
    },
  },
} as unknown as WarmupAccount;

function fixture() {
  const organization = {
    id: 'org-1',
    billingAccountId: 'billing-1',
    label: 'Prepared',
    slug: 'prepared',
  };
  const balance = {
    id: 'wallet-1',
    organizationId: 'org-1',
    billingAccountId: 'billing-1',
    balance: 500,
    heldAmount: 0,
    version: 1,
  };
  const tx = {
    $queryRaw: vi.fn(),
    warmupAccount: {
      findFirst: vi.fn().mockResolvedValue(account),
      findFirstOrThrow: vi.fn().mockResolvedValue(account),
      update: vi.fn(),
    },
    organization: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          where.id === 'org-1' ? organization : null,
        ),
      update: vi.fn(),
    },
    brand: {
      findFirst: vi.fn().mockResolvedValue({ id: 'brand-1', slug: 'brand' }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: 'customer-1' }),
      update: vi.fn(),
    },
    organizationSetting: {
      upsert: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({ id: 'org-setting' }),
      update: vi.fn(),
    },
    setting: {
      upsert: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({ id: 'user-setting' }),
      update: vi.fn(),
    },
    billingAccount: {
      findFirst: vi.fn().mockResolvedValue({ id: 'billing-1' }),
      create: vi.fn().mockResolvedValue({ id: 'billing-1' }),
    },
    billingAccountOrganization: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          typeof where.organizationId === 'string' ? { id: 'link-1' } : null,
        ),
      create: vi.fn(),
    },
    billingAccountMember: {
      upsert: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({ id: 'owner-1' }),
    },
    creditBalance: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) => (where.OR ? null : { ...balance })),
      create: vi.fn().mockResolvedValue(balance),
      update: vi.fn().mockImplementation(({ data }) => {
        if (data.balance) balance.balance += data.balance.increment;
        return { ...balance };
      }),
    },
    creditTransaction: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          where.id ? { id: 'grant-1' } : null,
        ),
      create: vi.fn().mockImplementation(({ data }) => ({
        ...data,
        id: 'grant-1',
        createdAt: new Date(),
      })),
    },
    asset: { findFirst: vi.fn().mockResolvedValue({ id: 'asset-1' }) },
    article: {
      findFirst: vi.fn().mockResolvedValue({ id: 'article-1' }),
      update: vi.fn(),
    },
    role: {
      findFirst: vi.fn().mockResolvedValue({ id: 'role-admin', key: 'admin' }),
    },
    member: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    tx,
    client: tx as unknown as Prisma.TransactionClient,
    balance,
    organization,
  };
}

describe('warm-up workspace handoff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('repairs both settings and dedicated ownership without another wallet', async () => {
    const { tx, client } = fixture();
    await reconcileWarmupWorkspace(client, account);
    await reconcileWarmupWorkspace(client, account);
    expect(tx.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'customer-1' } }),
    );
    expect(tx.organizationSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
    expect(tx.billingAccountMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          billingAccountId: 'billing-1',
          userId: 'customer-1',
          role: 'OWNER',
        },
      }),
    );
    expect(tx.billingAccount.create).not.toHaveBeenCalled();
    expect(tx.creditBalance.create).not.toHaveBeenCalled();
  });

  it('refuses another organization sharing the promised dedicated wallet', async () => {
    const { tx, client } = fixture();
    tx.billingAccountOrganization.findFirst.mockResolvedValue({
      id: 'foreign-link',
    });
    await expect(reconcileWarmupWorkspace(client, account)).rejects.toThrow(
      'must be dedicated',
    );
    expect(tx.creditBalance.update).not.toHaveBeenCalled();
  });

  it('does not resurrect an archived workspace', async () => {
    const { tx, client } = fixture();
    tx.brand.findFirst.mockResolvedValue(null);
    await expect(reconcileWarmupWorkspace(client, account)).rejects.toThrow(
      'missing or archived',
    );
    expect(tx.setting.upsert).not.toHaveBeenCalled();
  });

  it('rejects a wallet linked to unrelated billing', async () => {
    const { client, balance } = fixture();
    balance.billingAccountId = 'foreign-billing';
    await expect(reconcileWarmupWorkspace(client, account)).rejects.toThrow(
      'different billing account',
    );
  });

  it('records a non-expiring 500-credit grant in the canonical ledger', async () => {
    const { tx, client, balance } = fixture();
    balance.balance = 0;
    await creditWarmupWallet(
      client,
      account,
      'operator-1',
      500,
      'warmup:grant',
      'Customer evaluation',
    );
    expect(balance.balance).toBe(500);
    expect(tx.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 500,
        balanceAfter: 500,
        actorUserId: 'operator-1',
        organizationId: 'org-1',
        billingAccountId: 'billing-1',
        category: 'add',
        idempotencyKey: 'warmup:grant',
        metadata: expect.objectContaining({
          balanceBefore: 0,
        }),
      }),
    });
  });

  it('returns an existing grant without adding credits again', async () => {
    const { tx, client } = fixture();
    tx.creditTransaction.findFirst.mockResolvedValue({ id: 'already-granted' });
    expect(
      await creditWarmupWallet(
        client,
        account,
        'operator-1',
        500,
        'warmup:grant',
        'Customer evaluation',
      ),
    ).toEqual({ id: 'already-granted' });
    expect(tx.creditBalance.update).not.toHaveBeenCalled();
    expect(tx.creditTransaction.create).not.toHaveBeenCalled();
  });

  it('blocks an unprepared workspace rather than treating provisioning as readiness', async () => {
    const { client } = fixture();
    const result = await warmupReadiness(client, {
      ...account,
      diagnostics: {},
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'Configure the promotional handoff grant',
        'Review and apply brand context',
        'Prepare one completed private starter asset',
        'Prepare one private LinkedIn article draft',
      ]),
    );
  });

  it('blocks invitations until held generation credits settle', async () => {
    const { client, balance } = fixture();
    balance.heldAmount = 5;
    const result = await warmupReadiness(client, account);
    expect(result.ready).toBe(false);
    expect(result.availableCredits).toBe(495);
    expect(result.blockers).toContain(
      'Wait for outstanding generation reservations',
    );
  });

  it('only accepts tenant-scoped operator-authored private starter content', async () => {
    const { tx, client } = fixture();
    tx.asset.findFirst.mockResolvedValue(null);
    const result = await warmupReadiness(client, account);
    expect(result.ready).toBe(false);
    expect(tx.asset.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        parentOrgId: 'org-1',
        parentBrandId: 'brand-1',
        userId: 'operator-1',
        isDeleted: false,
        cloudObjectKey: { not: null },
      }),
    });
    expect(tx.article.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: 'org-1',
        brandId: 'brand-1',
        userId: 'operator-1',
        isDeleted: false,
        status: 'DRAFT',
        publishedAt: null,
      }),
    });
  });

  it('reconciles preparation spend at claim, selects the brand and removes operator access', async () => {
    const { tx, client, balance } = fixture();
    balance.balance = 460;
    expect(
      await claimWarmupWorkspace(client, 'invite-1', 'org-1', 'customer-1'),
    ).toBe('/prepared/brand');
    expect(balance.balance).toBe(500);
    expect(tx.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 40,
        source: 'warmup-preparation',
        actorUserId: 'operator-1',
      }),
    });
    expect(tx.member.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'operator-1',
        isDeleted: false,
      },
      data: { isActive: false },
    });
    expect(tx.member.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'customer-1',
        isDeleted: false,
      },
      data: expect.objectContaining({
        lastUsedBrandId: 'brand-1',
        roleKey: 'admin',
      }),
    });
    expect(tx.warmupAccount.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationId: 'org-1' }),
      data: expect.objectContaining({ status: 'CLAIMED' }),
    });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastUsedOrganizationId: 'org-1' }),
      }),
    );
  });

  it('does not claim a warm-up for another customer', async () => {
    const { tx, client } = fixture();
    await expect(
      claimWarmupWorkspace(client, 'invite-1', 'org-1', 'intruder'),
    ).rejects.toThrow('does not match');
    expect(tx.member.updateMany).not.toHaveBeenCalled();
    expect(tx.creditTransaction.create).not.toHaveBeenCalled();
  });

  it('leaves ordinary invitations unchanged', async () => {
    const { tx, client } = fixture();
    tx.warmupAccount.findFirst.mockResolvedValue(null);
    expect(
      await claimWarmupWorkspace(client, 'invite-1', 'org-1', 'customer-1'),
    ).toBeUndefined();
    expect(tx.setting.upsert).not.toHaveBeenCalled();
  });
});
