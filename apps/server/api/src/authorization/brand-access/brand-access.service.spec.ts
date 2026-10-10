import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ cloud: true }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => runtime.cloud,
}));

const actor = { organizationId: 'org-a', userId: 'opaque-auth-user' };
function fixture() {
  const member = {
    role: { key: MemberRole.USER },
    roleKey: MemberRole.OWNER,
    brands: [{ id: 'brand-a' }],
  };
  const findMember = vi.fn().mockResolvedValue(member);
  const findKey = vi
    .fn()
    .mockResolvedValue({ scopes: ['read', 'write', 'admin'] });
  const findBrand = vi
    .fn()
    .mockImplementation(async ({ where }: Prisma.BrandFindFirstArgs) => {
      const terms = where?.AND as Prisma.BrandWhereInput[];
      const scope = terms[0];
      const brandId = terms[1].id;
      const allowedIds =
        typeof scope.id === 'object' ? scope.id?.in : undefined;
      return scope.organizationId === 'org-a' &&
        ['brand-a', 'brand-b'].includes(String(brandId)) &&
        (allowedIds === undefined ||
          (Array.isArray(allowedIds) && allowedIds.includes(String(brandId))))
        ? { id: brandId }
        : null;
    });
  const prisma = {
    apiKey: { findFirst: findKey },
    member: { findFirst: findMember },
    brand: { findFirst: findBrand },
  } as unknown as PrismaService;
  return {
    member,
    findMember,
    findKey,
    findBrand,
    prisma,
    service: new BrandAccessService(prisma),
  };
}

describe('live Cloud member brand policy', () => {
  beforeEach(() => {
    runtime.cloud = true;
  });

  it.each([
    MemberRole.CREATOR,
    MemberRole.ANALYTICS,
    MemberRole.USER,
    MemberRole.SUPPORT,
  ])(
    'restricts ordinary %s using canonical role and opaque user identity',
    async (role) => {
      const f = fixture();
      f.member.role.key = role;
      expect(await f.service.predicate(actor)).toEqual({
        organizationId: 'org-a',
        isDeleted: false,
        id: { in: ['brand-a'] },
      });
      await f.service.assert(actor, 'brand-a');
      await expect(f.service.assert(actor, 'brand-b')).rejects.toThrow(
        ForbiddenException,
      );
      expect(f.findMember).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-a',
            userId: 'opaque-auth-user',
            isDeleted: false,
            isActive: true,
            organization: { is: { isDeleted: false } },
            role: { is: { isDeleted: false } },
          },
        }),
      );
    },
  );

  it.each([MemberRole.OWNER, MemberRole.ADMIN])(
    'allows %s all active organization brands',
    async (role) => {
      const f = fixture();
      f.member.role.key = role;
      f.member.brands = [];
      expect((await f.service.resolve(actor)).brandIds).toBeUndefined();
      await f.service.assert(actor, 'brand-b');
      await expect(f.service.assert(actor, 'foreign-brand')).rejects.toThrow(
        'Brand access denied',
      );
    },
  );

  it('explicitly denies empty assignments immediately and rechecks revocation', async () => {
    const f = fixture();
    await f.service.assert(actor, 'brand-a');
    f.member.brands = [];
    expect((await f.service.resolve(actor)).brandIds).toEqual([]);
    await expect(f.service.assert(actor, 'brand-a')).rejects.toThrow(
      'Brand access denied',
    );
  });

  it('caps owner keys before deciding privilege and honors explicit admin scope', async () => {
    const f = fixture();
    f.member.role.key = MemberRole.OWNER;
    f.member.brands = [];
    expect(
      (
        await f.service.resolve({
          ...actor,
          isApiKey: true,
          apiKeyId: 'key-a',
          scopes: ['read', 'write'],
        })
      ).role,
    ).toBe(MemberRole.USER);
    await expect(
      f.service.assert(
        { ...actor, isApiKey: true, apiKeyId: 'key-a', scopes: ['write'] },
        'brand-b',
      ),
    ).rejects.toThrow('Brand access denied');
    await f.service.assert(
      { ...actor, isApiKey: true, apiKeyId: 'key-a', scopes: ['admin'] },
      'brand-b',
    );
  });

  it('rechecks the bound live key and current scopes on each brand admission', async () => {
    const f = fixture();
    f.member.role.key = MemberRole.OWNER;
    f.member.brands = [];
    const keyActor = {
      ...actor,
      isApiKey: true,
      apiKeyId: 'key-a',
      scopes: ['admin'],
    };
    await f.service.assert(keyActor, 'brand-b');
    f.findKey.mockResolvedValue({ scopes: ['read'] });
    await expect(f.service.assert(keyActor, 'brand-b')).rejects.toThrow(
      'Brand access denied',
    );
    expect(f.findKey).toHaveBeenLastCalledWith({
      where: {
        id: 'key-a',
        userId: actor.userId,
        organizationId: actor.organizationId,
        isRevoked: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      select: { scopes: true },
    });
    f.findKey.mockResolvedValue(null);
    await expect(f.service.assert(keyActor, 'brand-b')).rejects.toThrow(
      'Brand access denied',
    );
  });

  it('requires key identity and uses the transaction for key admission', async () => {
    const f = fixture();
    await expect(
      f.service.assert(
        { ...actor, isApiKey: true, scopes: ['read'] },
        'brand-a',
      ),
    ).rejects.toThrow('Brand access denied');
    expect(f.findKey).not.toHaveBeenCalled();
    expect(f.findMember).not.toHaveBeenCalled();
    const tx = fixture();
    tx.findKey.mockResolvedValue(null);
    await expect(
      f.service.assert(
        { ...actor, isApiKey: true, apiKeyId: 'key-a', scopes: ['read'] },
        'brand-a',
        tx.prisma,
      ),
    ).rejects.toThrow('Brand access denied');
    expect(tx.findKey).toHaveBeenCalledOnce();
    expect(f.findKey).not.toHaveBeenCalled();
    expect(tx.findMember).not.toHaveBeenCalled();
  });

  it('uses the transaction client for both canonical member and brand checks', async () => {
    const f = fixture();
    const tx = fixture();
    tx.member.brands = [];
    await expect(f.service.assert(actor, 'brand-a', tx.prisma)).rejects.toThrow(
      'Brand access denied',
    );
    expect(f.findMember).not.toHaveBeenCalled();
    expect(tx.findMember).toHaveBeenCalledOnce();
  });

  it('fails closed for missing/inactive/deleted membership and role lookup failure', async () => {
    const f = fixture();
    f.findMember.mockResolvedValue(null);
    await expect(f.service.assert(actor, 'brand-a')).rejects.toThrow(
      'Brand access denied',
    );
    expect(f.findBrand).not.toHaveBeenCalled();
    f.findMember.mockRejectedValue(new Error('database unavailable'));
    await expect(f.service.assert(actor, 'brand-a')).rejects.toThrow(
      'database unavailable',
    );
    expect(f.findBrand).not.toHaveBeenCalled();
  });

  it('denies hidden, missing, foreign and deleted identifiers identically', async () => {
    const f = fixture();
    const responses = [];
    for (const id of [
      'brand-b',
      'unknown-brand',
      'foreign-brand',
      'deleted-brand',
    ]) {
      try {
        await f.service.assert(actor, id);
      } catch (error) {
        responses.push((error as ForbiddenException).getResponse());
      }
    }
    expect(responses).toHaveLength(4);
    expect(new Set(responses.map((value) => JSON.stringify(value))).size).toBe(
      1,
    );
  });

  it('preserves selfhost organization restriction without adding assignments', async () => {
    runtime.cloud = false;
    const f = fixture();
    f.member.brands = [];
    expect(await f.service.predicate(actor)).toEqual({
      organizationId: 'org-a',
      isDeleted: false,
    });
    expect(f.findMember).not.toHaveBeenCalled();
    await f.service.assert(actor, 'brand-b');
    await expect(f.service.assert(actor, 'foreign-brand')).rejects.toThrow(
      'Brand access denied',
    );
  });
});

it('preserves actorless cosmetic selfhost reads while Cloud rejects a missing initiating user', async () => {
  const f = fixture();
  runtime.cloud = false;
  expect(
    await f.service.predicate({ organizationId: 'org-a', userId: '' }),
  ).toEqual({ organizationId: 'org-a', isDeleted: false });
  expect(f.findMember).not.toHaveBeenCalled();
  runtime.cloud = true;
  await expect(
    f.service.predicate({ organizationId: 'org-a', userId: '' }),
  ).rejects.toThrow(ForbiddenException);
  expect(f.findMember).not.toHaveBeenCalled();
});
