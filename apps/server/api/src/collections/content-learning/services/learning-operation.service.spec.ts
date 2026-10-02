import { LearningReceivingDto } from '@api/collections/content-learning/dto/learning-consent.dto';
import { LearningControlDto } from '@api/collections/content-learning/dto/learning-control.dto';
import { LearningQueryDto } from '@api/collections/content-learning/dto/learning-query.dto';
import {
  LearningOperationService,
  learningScopeKey,
} from '@api/collections/content-learning/services/learning-operation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
function fixture(role = 'owner') {
  const rootMember = { role: { key: role } },
    transactionMember = { role: { key: role } };
  const account = {
    id: 'account',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
    revision: 3,
  };
  const transaction = {
    member: { findFirst: vi.fn().mockResolvedValue(transactionMember) },
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
    member: { findFirst: vi.fn().mockResolvedValue(rootMember) },
    $transaction: vi.fn().mockImplementation((fn) => fn(transaction)),
  };
  return {
    service: new LearningOperationService(prisma as unknown as PrismaService),
    transaction,
    prisma,
    rootMember,
    transactionMember,
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
  it('binds idempotency to mutation type and target resource', async () => {
    const f = fixture(),
      apply = vi.fn().mockResolvedValue({});
    const input = {
      actor: { actorId: 'user', organizationId: 'org' },
      credentialId: 'credential',
      requestId: 'same',
      expectedRevision: 3,
      type: 'post-eligibility',
      payload: { resourceId: 'post-a' },
    };
    const receipt = await f.service.mutate(input, apply);
    f.transaction.contentLearningOperation.findFirst.mockResolvedValue(receipt);
    await expect(
      f.service.mutate({ ...input, payload: { resourceId: 'post-b' } }, apply),
    ).rejects.toThrow('payload conflict');
    await expect(
      f.service.mutate({ ...input, type: 'reset' }, apply),
    ).rejects.toThrow('payload conflict');
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe('HTTP learning mutation and pagination validation', () => {
  const requestId = 'b4f6ce2d-5cce-4b19-8852-30ff0b63b385';
  it('converts valid query strings and preserves absent defaults', async () => {
    const value = plainToInstance(LearningQueryDto, { page: '2', limit: '40' });
    expect(await validate(value)).toHaveLength(0);
    expect(value).toMatchObject({ page: 2, limit: 40 });
    expect(plainToInstance(LearningQueryDto, {})).toMatchObject({
      page: 1,
      limit: 20,
    });
  });
  it.each(['', 'NaN', '1.5', '0', '101'])(
    'rejects invalid pagination %s',
    async (page) => {
      expect(
        (await validate(plainToInstance(LearningQueryDto, { page }))).length,
      ).toBeGreaterThan(0);
    },
  );
  it('requires an explicit rollback policy and pinned release before persistence', async () => {
    expect(
      (
        await validate(
          plainToInstance(LearningControlDto, {
            action: 'rollback',
            reason: 'Requested rollback',
            requestId,
            expectedRevision: 0,
          }),
        )
      ).some((error) => error.property === 'policyId'),
    ).toBe(true);
    expect(
      (
        await validate(
          plainToInstance(LearningReceivingDto, {
            preference: 'pinned',
            requestId,
            expectedRevision: 0,
          }),
        )
      ).some((error) => error.property === 'releaseId'),
    ).toBe(true);
    expect(
      await validate(
        plainToInstance(LearningReceivingDto, {
          preference: 'automatic',
          requestId,
          expectedRevision: 0,
        }),
      ),
    ).toHaveLength(0);
  });
});

describe('membership lookup joins the explicit client without owning entry', () => {
  const actor = { actorId: 'user', organizationId: 'org' };
  const query = {
    where: {
      organizationId: 'org',
      userId: 'user',
      isDeleted: false,
      isActive: true,
    },
    include: { role: true },
  };
  const message =
    'Real organization membership and the required role are required';
  it.each(['omitted', 'undefined'])(
    'retains default root lookup for %s client and read permission for non-admin ownerOnly',
    async (kind) => {
      const f = fixture('member');
      expect(
        await (kind === 'omitted'
          ? f.service.assertMember(actor, false, true)
          : f.service.assertMember(actor, false, true, undefined)),
      ).toBe(f.rootMember);
      expect(f.prisma.member.findFirst).toHaveBeenCalledWith(query);
      expect(f.transaction.member.findFirst).not.toHaveBeenCalled();
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
      expect(f.transaction.$queryRaw).not.toHaveBeenCalled();
    },
  );
  it.each([
    { role: 'OWNER', ownerOnly: false, allowed: true },
    { role: 'Admin', ownerOnly: false, allowed: true },
    { role: 'owner', ownerOnly: true, allowed: true },
    { role: 'admin', ownerOnly: true, allowed: false },
    { role: 'member', ownerOnly: false, allowed: false },
  ])(
    'preserves real default role policy $role/$ownerOnly',
    async ({ role, ownerOnly, allowed }) => {
      const f = fixture(role),
        result = f.service.assertMember(actor, true, ownerOnly);
      if (allowed) expect(await result).toBe(f.rootMember);
      else await expect(result).rejects.toThrow(message);
      expect(f.prisma.member.findFirst).toHaveBeenCalledWith(query);
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
      expect(f.transaction.$queryRaw).not.toHaveBeenCalled();
    },
  );
  it.each(['owner', 'missing', 'admin-ownerOnly', 'member'])(
    'uses distinct supplied client %s and never falls back to root owner',
    async (kind) => {
      const f = fixture('owner');
      if (kind === 'missing')
        f.transaction.member.findFirst.mockResolvedValue(null);
      if (kind === 'admin-ownerOnly') f.transactionMember.role.key = 'admin';
      if (kind === 'member') f.transactionMember.role.key = 'member';
      const result = f.service.assertMember(
        actor,
        true,
        kind === 'admin-ownerOnly',
        f.transaction as unknown as Prisma.TransactionClient,
      );
      if (kind === 'owner') expect(await result).toBe(f.transactionMember);
      else await expect(result).rejects.toThrow(message);
      expect(f.transaction.member.findFirst).toHaveBeenCalledWith(query);
      expect(f.prisma.member.findFirst).not.toHaveBeenCalled();
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
      expect(f.transaction.$queryRaw).not.toHaveBeenCalled();
    },
  );
  it('retains exact missing default membership rejection', async () => {
    const f = fixture();
    f.prisma.member.findFirst.mockResolvedValue(null);
    await expect(f.service.assertMember(actor)).rejects.toThrow(message);
    expect(f.transaction.member.findFirst).not.toHaveBeenCalled();
  });
});
