import {
  LearningOperationService,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
function fixture(role = 'owner') {
  const account = {
    id: 'account',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    revision: 3,
  };
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentLearningAccount: {
      findFirst: vi.fn().mockResolvedValue(account),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentLearningOperation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'operation', ...data }),
        ),
    },
  };
  const prisma = {
    member: { findFirst: vi.fn().mockResolvedValue({ role: { key: role } }) },
    $transaction: vi.fn().mockImplementation((fn) => fn(transaction)),
  };
  return {
    service: new LearningOperationService(prisma as unknown as PrismaService),
    transaction,
    prisma,
  };
}
describe('real roles and revision-locked mutation receipts', () => {
  it('rejects absent membership and admin sharing grants without relying on superadmin bypass', async () => {
    const f = fixture('admin');
    await expect(
      f.service.assertMember(
        { actorId: 'user', organizationId: 'org' },
        true,
        true,
      ),
    ).rejects.toThrow('Real organization membership');
    f.prisma.member.findFirst.mockResolvedValue(null);
    await expect(
      f.service.assertMember({ actorId: 'user', organizationId: 'org' }),
    ).rejects.toThrow();
  });
  it('serializes scope and returns a durable receipt with before/after revisions', async () => {
    const f = fixture(),
      apply = vi.fn().mockResolvedValue({ accountId: 'account' });
    const receipt = await f.service.mutate(
      {
        actor: { organizationId: 'org', actorId: 'user' },
        credentialId: 'credential',
        requestId: 'request',
        expectedRevision: 3,
        type: 'pause',
        payload: { action: 'pause' },
      },
      apply,
    );
    expect(receipt.beforeRevision).toBe(3);
    expect(receipt.afterRevision).toBe(4);
    expect(f.transaction.$queryRaw).toHaveBeenCalled();
    expect(
      f.transaction.contentLearningAccount.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          revision: 3,
          isDeleted: false,
        }),
      }),
    );
  });
  it('returns 409 before applying a stale mutation', async () => {
    const f = fixture(),
      apply = vi.fn();
    await expect(
      f.service.mutate(
        {
          actor: { organizationId: 'org', actorId: 'user' },
          credentialId: 'credential',
          requestId: 'request',
          expectedRevision: 2,
          type: 'reset',
          payload: {},
        },
        apply,
      ),
    ).rejects.toThrow();
    expect(apply).not.toHaveBeenCalled();
  });
  it('tuple hashing avoids delimiter aliases between tenant/account cells', () => {
    const scope = {
      organizationId: 'a|b',
      brandId: 'c',
      credentialId: 'd',
      platform: 'twitter',
      format: 'text',
      objective: 'awareness',
      rewardProfileId: 'awareness-v1',
    };
    expect(learningScopeKey(scope)).not.toBe(
      learningScopeKey({ ...scope, organizationId: 'a', brandId: 'b|c' }),
    );
  });
});
