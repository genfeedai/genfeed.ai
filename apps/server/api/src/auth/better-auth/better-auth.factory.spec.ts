import { describe, expect, it, vi } from 'vitest';
import {
  resolveBetterAuthJwtAccess,
  resolveBetterAuthJwtIsSuperAdmin,
  resolveBetterAuthJwtOrganizationId,
} from './better-auth.factory';
import type { ICreateBetterAuthOptions } from './better-auth.types';

type PrismaForBetterAuth = ICreateBetterAuthOptions['prisma'];

function createPrismaMock() {
  return {
    member: {
      findFirst: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  };
}

describe('resolveBetterAuthJwtOrganizationId', () => {
  it('prefers lastUsedOrganizationId when the user can access it', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      lastUsedOrganizationId: 'org_active',
    });
    prisma.organization.findFirst.mockResolvedValue({ id: 'org_active' });

    await expect(
      resolveBetterAuthJwtOrganizationId(
        prisma as unknown as PrismaForBetterAuth,
        'user_1',
      ),
    ).resolves.toBe('org_active');

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      select: { lastUsedOrganizationId: true },
      where: { id: 'user_1', isDeleted: false },
    });
    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: 'org_active',
        isDeleted: false,
        OR: [
          { userId: 'user_1' },
          {
            members: {
              some: {
                isActive: true,
                isDeleted: false,
                userId: 'user_1',
              },
            },
          },
        ],
      },
    });
    expect(prisma.member.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to an owned organization when lastUsedOrganizationId is inaccessible', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      lastUsedOrganizationId: 'org_stale',
    });
    prisma.organization.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'org_owner' });

    await expect(
      resolveBetterAuthJwtOrganizationId(
        prisma as unknown as PrismaForBetterAuth,
        'user_2',
      ),
    ).resolves.toBe('org_owner');

    expect(prisma.organization.findFirst).toHaveBeenLastCalledWith({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      where: {
        isDeleted: false,
        userId: 'user_2',
      },
    });
  });

  it('falls back to an active membership organization when the user owns none', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      lastUsedOrganizationId: null,
    });
    prisma.organization.findFirst.mockResolvedValue(null);
    prisma.member.findFirst.mockResolvedValue({
      organizationId: 'org_member',
    });

    await expect(
      resolveBetterAuthJwtOrganizationId(
        prisma as unknown as PrismaForBetterAuth,
        'user_3',
      ),
    ).resolves.toBe('org_member');

    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      select: { organizationId: true },
      where: {
        isActive: true,
        isDeleted: false,
        organization: { isDeleted: false },
        userId: 'user_3',
      },
    });
  });

  it('returns undefined when no accessible organization exists', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.organization.findFirst.mockResolvedValue(null);
    prisma.member.findFirst.mockResolvedValue(null);

    await expect(
      resolveBetterAuthJwtOrganizationId(
        prisma as unknown as PrismaForBetterAuth,
        'user_4',
      ),
    ).resolves.toBeUndefined();

    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
    expect(prisma.member.findFirst).not.toHaveBeenCalled();
  });
});

describe('resolveBetterAuthJwtIsSuperAdmin', () => {
  it('derives signed superadmin compatibility claims from platformRole', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      platformRole: 'SUPERADMIN',
    });

    await expect(
      resolveBetterAuthJwtIsSuperAdmin(
        prisma as unknown as PrismaForBetterAuth,
        'user_superadmin',
      ),
    ).resolves.toBe(true);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      select: { platformRole: true },
      where: { id: 'user_superadmin', isDeleted: false },
    });
  });

  it('does not grant superadmin for default platform users', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      platformRole: 'USER',
    });

    await expect(
      resolveBetterAuthJwtIsSuperAdmin(
        prisma as unknown as PrismaForBetterAuth,
        'user_org_admin',
      ),
    ).resolves.toBe(false);
  });
});

describe('resolveBetterAuthJwtAccess', () => {
  it('resolves active organization and superadmin compatibility from one user lookup', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue({
      lastUsedOrganizationId: 'org_active',
      platformRole: 'SUPERADMIN',
    });
    prisma.organization.findFirst.mockResolvedValue({ id: 'org_active' });

    await expect(
      resolveBetterAuthJwtAccess(
        prisma as unknown as PrismaForBetterAuth,
        'user_superadmin',
      ),
    ).resolves.toEqual({
      isSuperAdmin: true,
      organizationId: 'org_active',
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      select: { lastUsedOrganizationId: true, platformRole: true },
      where: { id: 'user_superadmin', isDeleted: false },
    });
  });

  it('fails closed when the user is missing or soft-deleted', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      resolveBetterAuthJwtAccess(
        prisma as unknown as PrismaForBetterAuth,
        'user_deleted',
      ),
    ).resolves.toEqual({ isSuperAdmin: false });

    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
    expect(prisma.member.findFirst).not.toHaveBeenCalled();
  });
});
