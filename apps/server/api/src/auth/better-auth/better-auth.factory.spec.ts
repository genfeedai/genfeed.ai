import type { RateLimit } from 'better-auth';
import { describe, expect, it, vi } from 'vitest';
import {
  assertSignupMagicLinkCanCreateUser,
  buildBetterAuthOrganizationOptions,
  buildRateLimitStorage,
  createBetterAuthInstance,
  resolveBetterAuthJwtAccess,
  resolveBetterAuthJwtIsSuperAdmin,
  resolveBetterAuthJwtOrganizationId,
  SIGN_UP_MAGIC_LINK_EXISTING_USER_MESSAGE,
} from './better-auth.factory';
import type {
  IBetterAuthRateLimitStore,
  ICreateBetterAuthOptions,
} from './better-auth.types';

type PrismaForBetterAuth = ICreateBetterAuthOptions['prisma'];

function createPrismaMock() {
  return {
    member: {
      findFirst: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
    role: {
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

describe('buildBetterAuthOrganizationOptions', () => {
  it('maps Better Auth organization tables onto Genfeed ownership fields', () => {
    const options = buildBetterAuthOrganizationOptions(
      createPrismaMock() as unknown as PrismaForBetterAuth,
    );

    expect(options.creatorRole).toBe('admin');
    expect(options.disableOrganizationDeletion).toBe(true);
    expect(options.requireEmailVerificationOnInvitation).toBe(true);
    expect(options.schema?.session?.fields?.activeOrganizationId).toBe(
      'activeOrganizationId',
    );
    expect(options.schema?.organization?.modelName).toBe('organization');
    expect(options.schema?.organization?.fields?.name).toBe('label');
    expect(options.schema?.organization?.fields?.logo).toBe(
      'authProviderLogoUrl',
    );
    expect(options.schema?.member?.modelName).toBe('member');
    expect(options.schema?.member?.fields?.role).toBe('roleKey');
    expect(options.schema?.member?.additionalFields?.roleId).toMatchObject({
      references: { field: 'id', model: 'role' },
      required: true,
      type: 'string',
    });
    expect(options.schema?.invitation?.modelName).toBe('invitation');
    expect(options.schema?.invitation?.fields?.role).toBe('roleKey');
    expect(options.schema?.invitation?.fields?.status).toBe('status');
  });

  it('fills required Genfeed organization fields before plugin organization creation', async () => {
    const options = buildBetterAuthOrganizationOptions(
      createPrismaMock() as unknown as PrismaForBetterAuth,
    );

    const result = await options.organizationHooks?.beforeCreateOrganization?.({
      organization: { name: 'Acme', slug: 'acme' },
      user: { id: 'user_1' } as never,
    });

    expect(result).toEqual({
      data: {
        category: 'BUSINESS',
        isDeleted: false,
        isSelected: false,
        name: 'Acme',
        slug: 'acme',
        userId: 'user_1',
      },
    });
  });

  it('rejects Better Auth add-member so a BA org role cannot grant a Genfeed Role', async () => {
    const prisma = createPrismaMock();
    const options = buildBetterAuthOrganizationOptions(
      prisma as unknown as PrismaForBetterAuth,
    );

    await expect(
      options.organizationHooks?.beforeAddMember?.({
        member: {
          organizationId: 'org_1',
          role: 'owner',
          userId: 'user_1',
        },
        organization: { id: 'org_1' } as never,
        user: { id: 'user_1' } as never,
      }),
    ).rejects.toThrow('Genfeed owns organization membership');

    // No Role is ever resolved/written through the BA path.
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
  });

  it('rejects Better Auth member role changes so escalation cannot bypass RolesGuard', async () => {
    const prisma = createPrismaMock();
    const options = buildBetterAuthOrganizationOptions(
      prisma as unknown as PrismaForBetterAuth,
    );

    await expect(
      options.organizationHooks?.beforeUpdateMemberRole?.({
        member: {
          id: 'member_1',
          organizationId: 'org_1',
          role: 'member',
          userId: 'user_1',
        } as never,
        newRole: 'owner',
        organization: { id: 'org_1' } as never,
        user: { id: 'user_1' } as never,
      }),
    ).rejects.toThrow('Genfeed owns organization membership');
    expect(prisma.role.findFirst).not.toHaveBeenCalled();
  });

  it('rejects Better Auth invitation creation because Genfeed owns invites', async () => {
    const options = buildBetterAuthOrganizationOptions(
      createPrismaMock() as unknown as PrismaForBetterAuth,
    );

    await expect(
      options.organizationHooks?.beforeCreateInvitation?.({
        invitation: {
          email: 'user@example.com',
          inviterId: 'user_1',
          organizationId: 'org_1',
          role: 'member',
        },
        inviter: { id: 'user_1' } as never,
        organization: { id: 'org_1' } as never,
      }),
    ).rejects.toThrow(
      'Genfeed InvitationService owns organization invitations',
    );
  });
});

describe('assertSignupMagicLinkCanCreateUser', () => {
  it('does not query for normal login magic links', async () => {
    const prisma = createPrismaMock();

    await expect(
      assertSignupMagicLinkCanCreateUser({
        email: 'existing@example.com',
        prisma: prisma as unknown as PrismaForBetterAuth,
      }),
    ).resolves.toBeUndefined();

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('allows signup magic links for emails without an active user', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      assertSignupMagicLinkCanCreateUser({
        email: ' New@Example.com ',
        metadata: { intent: 'signup' },
        prisma: prisma as unknown as PrismaForBetterAuth,
      }),
    ).resolves.toBeUndefined();

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        email: { equals: 'new@example.com', mode: 'insensitive' },
        isDeleted: false,
      },
    });
  });

  it('rejects signup magic links when the email already belongs to a user', async () => {
    const prisma = createPrismaMock();
    prisma.user.findFirst.mockResolvedValue({ id: 'user_existing' });

    await expect(
      assertSignupMagicLinkCanCreateUser({
        email: 'existing@example.com',
        metadata: { intent: 'signup' },
        prisma: prisma as unknown as PrismaForBetterAuth,
      }),
    ).rejects.toMatchObject({
      body: expect.objectContaining({
        code: 'USER_ALREADY_EXISTS',
        message: SIGN_UP_MAGIC_LINK_EXISTING_USER_MESSAGE,
      }),
      status: 'BAD_REQUEST',
    });
  });
});

/** In-memory stand-in for the Redis KV that records the args it was called with. */
function createFakeRateLimitStore(): IBetterAuthRateLimitStore & {
  readonly entries: Map<string, string>;
  readonly setCalls: Array<{ key: string; value: string; ttlSeconds: number }>;
} {
  const entries = new Map<string, string>();
  const setCalls: Array<{ key: string; value: string; ttlSeconds: number }> =
    [];
  return {
    entries,
    get: async (key) => entries.get(key) ?? null,
    set: async (key, value, ttlSeconds) => {
      entries.set(key, value);
      setCalls.push({ key, ttlSeconds, value });
    },
    setCalls,
  };
}

const sampleRateLimit: RateLimit = {
  count: 3,
  key: 'ip:1.2.3.4',
  lastRequest: 1700,
};

describe('buildRateLimitStorage', () => {
  it('round-trips a rate-limit record through the shared store', async () => {
    const storage = buildRateLimitStorage(createFakeRateLimitStore());

    await storage.set('ip:1.2.3.4', sampleRateLimit);

    expect(await storage.get('ip:1.2.3.4')).toEqual(sampleRateLimit);
  });

  it('namespaces keys and applies a TTL so idle counters self-expire', async () => {
    const store = createFakeRateLimitStore();
    const storage = buildRateLimitStorage(store);

    await storage.set('ip:1.2.3.4', sampleRateLimit);

    const [call] = store.setCalls;
    expect(call.key).toBe('ba:ratelimit:ip:1.2.3.4');
    expect(call.value).toBe(JSON.stringify(sampleRateLimit));
    expect(call.ttlSeconds).toBeGreaterThan(0);
  });

  it('returns null when the counter is absent (fail-open path)', async () => {
    const storage = buildRateLimitStorage(createFakeRateLimitStore());

    expect(await storage.get('missing')).toBeNull();
  });
});

describe('createBetterAuthInstance source', () => {
  it('wires social provider and email-verification options into Better Auth', () => {
    const source = createBetterAuthInstance.toString();

    expect(source).toContain('socialProviders');
    expect(source).toContain('github');
    expect(source).toContain('google');
    expect(source).toContain('requireEmailVerification');
    expect(source).toContain('sendVerificationEmail');
    expect(source).toContain('sendResetPassword');
    expect(source).toContain('revokeSessionsOnPasswordReset');
    expect(source).toContain('accountLinking');
    expect(source).toContain('trustedProviders');
    expect(source).toContain('enabled: true');
    expect(source).toContain('rateLimit');
  });

  it('declares `handle` as a known user field so first-time sign-ups persist it', () => {
    // The `databaseHooks.user.create.before` hook injects a generated `handle`,
    // but Better Auth strips fields it does not know about before the adapter
    // write. Without this `additionalFields` declaration the `handle` value is
    // dropped and every first-time sign-up fails at `db.user.create()` with
    // `Argument 'handle' is missing`, so no session is ever established.
    const source = createBetterAuthInstance.toString();

    expect(source).toContain('additionalFields');
    expect(source).toMatch(/handle:\s*\{/);
  });
});
