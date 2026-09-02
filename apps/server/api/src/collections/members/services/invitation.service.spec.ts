import { createHash } from 'node:crypto';
import { InvitationService } from '@api/collections/members/services/invitation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, GoneException } from '@nestjs/common';

const now = new Date('2026-06-23T12:00:00.000Z');
const orgId = 'org_123';
const userId = 'user_123';
const roleId = 'role_user';
const roleKey = 'member';
const memberId = 'member_123';

type MockFn = ReturnType<typeof vi.fn>;

interface MockPrisma {
  $transaction: MockFn;
  invitation: {
    create: MockFn;
    findMany: MockFn;
    findFirst: MockFn;
    findUnique: MockFn;
    update: MockFn;
    updateMany: MockFn;
  };
  member: {
    create: MockFn;
    findFirst: MockFn;
    update: MockFn;
  };
  organization: {
    findFirst: MockFn;
  };
  role: {
    findFirst: MockFn;
  };
  setting: {
    create: MockFn;
  };
  user: {
    create: MockFn;
    findFirst: MockFn;
    update: MockFn;
  };
}

interface InvitationRow {
  acceptedAt: Date | null;
  acceptedByUserId: string | null;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  firstName: string | null;
  id: string;
  invitedByUserId: string;
  isDeleted: boolean;
  lastName: string | null;
  organization?: { label: string } | null;
  organizationId: string;
  redirectUrl: string | null;
  revokedAt: Date | null;
  roleId: string;
  roleKey: string;
  status: string;
  tokenHash: string;
  updatedAt: Date;
}

interface UserRow {
  email: string;
  id: string;
  isDeleted: boolean;
  isInvited: boolean;
}

interface MemberRow {
  id: string;
  isActive: boolean;
  isDeleted: boolean;
  organizationId: string;
  roleId: string;
  roleKey: string;
  userId: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function makeInvitation(overrides: Partial<InvitationRow> = {}): InvitationRow {
  return {
    acceptedAt: null,
    acceptedByUserId: null,
    createdAt: now,
    email: 'new@example.com',
    expiresAt: new Date('2026-06-30T12:00:00.000Z'),
    firstName: 'New',
    id: 'inv_123',
    invitedByUserId: userId,
    isDeleted: false,
    lastName: 'User',
    organization: { label: 'Acme' },
    organizationId: orgId,
    redirectUrl: null,
    revokedAt: null,
    roleId,
    roleKey,
    status: 'pending',
    tokenHash: hashToken('token-123'),
    updatedAt: now,
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    email: 'new@example.com',
    id: userId,
    isDeleted: false,
    isInvited: true,
    ...overrides,
  };
}

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: memberId,
    isActive: false,
    isDeleted: false,
    organizationId: orgId,
    roleId,
    roleKey,
    userId,
    ...overrides,
  };
}

function buildPrisma(): MockPrisma {
  const prisma: MockPrisma = {
    $transaction: vi.fn(),
    invitation: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    member: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findFirst: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    setting: {
      create: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  prisma.$transaction.mockImplementation(
    async (callback: (tx: MockPrisma) => Promise<unknown>) => callback(prisma),
  );

  return prisma;
}

function buildService(prisma = buildPrisma()) {
  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'GENFEEDAI_API_URL') {
        return 'https://api.test';
      }
      if (key === 'GENFEEDAI_APP_URL') {
        return 'https://app.test';
      }
      return undefined;
    }),
  } as unknown as ConfigService;

  const notificationsService = {
    sendEmail: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;

  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  return {
    configService,
    logger,
    notificationsService,
    prisma,
    service: new InvitationService(
      prisma as unknown as PrismaService,
      configService,
      notificationsService,
      logger,
    ),
  };
}

describe('InvitationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('createInvitation', () => {
    it('creates a hashed invitation token and sends an accept email', async () => {
      const { notificationsService, prisma, service } = buildService();
      prisma.role.findFirst.mockResolvedValue({ id: roleId, key: roleKey });
      prisma.organization.findFirst.mockResolvedValue({
        id: orgId,
        label: 'Acme',
      });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.invitation.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      prisma.invitation.create.mockImplementation((args: unknown) => {
        const data = (args as { data: Partial<InvitationRow> }).data;
        return Promise.resolve(makeInvitation(data));
      });

      const result = await service.createInvitation({
        email: 'NEW@Example.COM',
        firstName: 'New',
        invitedByUserId: userId,
        lastName: 'User',
        organizationId: orgId,
      });

      expect(prisma.invitation.updateMany).toHaveBeenCalledWith({
        data: { isDeleted: true, revokedAt: now, status: 'canceled' },
        where: {
          acceptedAt: null,
          email: 'new@example.com',
          isDeleted: false,
          organizationId: orgId,
          revokedAt: null,
        },
      });
      expect(prisma.invitation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          invitedByUserId: userId,
          organizationId: orgId,
          roleId,
          roleKey,
          status: 'pending',
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      });
      expect(notificationsService.sendEmail).toHaveBeenCalledWith(
        'new@example.com',
        "You're invited to Acme",
        expect.stringContaining('https://api.test/accept-invitation?token='),
      );
      expect(result).toMatchObject({
        email: 'new@example.com',
        organizationId: orgId,
        roleId,
        status: 'delivered',
      });
    });

    it('rejects invitations for users already active in the organization', async () => {
      const { prisma, service } = buildService();
      prisma.role.findFirst.mockResolvedValue({ id: roleId, key: roleKey });
      prisma.organization.findFirst.mockResolvedValue({
        id: orgId,
        label: 'Acme',
      });
      prisma.user.findFirst.mockResolvedValue(makeUser({ isInvited: false }));
      prisma.member.findFirst.mockResolvedValue(makeMember({ isActive: true }));

      await expect(
        service.createInvitation({
          email: 'new@example.com',
          invitedByUserId: userId,
          organizationId: orgId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    // #2715 — the invitee is a third party with no account and no relationship
    // to this log sink, and the delivery-failure branch is the one most likely
    // to be shipped to an aggregator, retained, and read widely.
    it('redacts the invitee email to its domain when delivery fails', async () => {
      const { logger, notificationsService, prisma, service } = buildService();
      prisma.role.findFirst.mockResolvedValue({ id: roleId, key: roleKey });
      prisma.organization.findFirst.mockResolvedValue({
        id: orgId,
        label: 'Acme',
      });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.invitation.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      prisma.invitation.create.mockImplementation((args: unknown) => {
        const data = (args as { data: Partial<InvitationRow> }).data;
        return Promise.resolve(makeInvitation(data));
      });

      const deliveryError = new Error('smtp unavailable');
      const sendEmail = notificationsService.sendEmail as unknown as MockFn;
      sendEmail.mockRejectedValue(deliveryError);
      const errorLog = logger.error as unknown as MockFn;

      // A delivery failure must stay non-fatal — the invitation row is committed.
      const result = await service.createInvitation({
        email: 'invitee@example.com',
        invitedByUserId: userId,
        organizationId: orgId,
      });

      expect(result.status).toBe('delivery-failed');
      expect(errorLog).toHaveBeenCalledWith(
        'Failed to send invitation email',
        deliveryError,
        {
          emailDomain: 'example.com',
          invitationId: 'inv_123',
          organizationId: orgId,
          service: 'InvitationService',
        },
      );
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain(
        'invitee@example.com',
      );
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('invitee');
      expect(prisma.invitation.updateMany).toHaveBeenLastCalledWith({
        data: {
          status: 'delivery-failed',
          updatedAt: now,
        },
        where: {
          acceptedAt: null,
          id: 'inv_123',
          isDeleted: false,
          organizationId: orgId,
          revokedAt: null,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });
    });
  });

  describe('listInvitations', () => {
    it('filters by pending status when requested', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findMany.mockResolvedValue([makeInvitation()]);

      const result = await service.listInvitations(orgId, 'pending');

      expect(prisma.invitation.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        where: {
          acceptedAt: null,
          expiresAt: { gt: now },
          isDeleted: false,
          organizationId: orgId,
          revokedAt: null,
          status: 'pending',
        },
      });
      expect(result).toEqual([
        expect.objectContaining({
          id: 'inv_123',
          status: 'pending',
        }),
      ]);
    });

    it('returns all invitations when no status filter is provided', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findMany.mockResolvedValue([makeInvitation()]);

      await service.listInvitations(orgId);

      expect(prisma.invitation.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        where: {
          isDeleted: false,
          organizationId: orgId,
        },
      });
    });
  });

  describe('getInvitation', () => {
    it('returns the invitation view without token material', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findFirst.mockResolvedValue(makeInvitation());

      const result = await service.getInvitation('inv_123', orgId);

      expect(prisma.invitation.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'inv_123',
          isDeleted: false,
          organizationId: orgId,
        },
      });
      expect(result).toMatchObject({
        email: 'new@example.com',
        id: 'inv_123',
        status: 'pending',
      });
      expect(result).not.toHaveProperty('tokenHash');
    });

    it('returns not found for missing invitations', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findFirst.mockResolvedValue(null);

      await expect(
        service.getInvitation('missing', orgId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('revokeInvitation', () => {
    it('revokes a pending invitation in the owning organization', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findFirst.mockResolvedValue(makeInvitation());
      prisma.invitation.update.mockResolvedValue(
        makeInvitation({ revokedAt: now }),
      );

      const result = await service.revokeInvitation('inv_123', orgId);

      expect(prisma.invitation.update).toHaveBeenCalledWith({
        data: { revokedAt: now, status: 'canceled' },
        where: { id: 'inv_123', isDeleted: false, organizationId: orgId },
      });
      expect(result.status).toBe('revoked');
    });

    it('returns not found for missing invitations', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeInvitation('missing', orgId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resendInvitation', () => {
    it('rotates delivery on the same invitation record', async () => {
      const { notificationsService, prisma, service } = buildService();
      prisma.invitation.findFirst.mockResolvedValue(
        makeInvitation({ status: 'delivery-failed' }),
      );
      prisma.organization.findFirst.mockResolvedValue({
        id: orgId,
        label: 'Acme',
      });
      prisma.invitation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });

      const result = await service.resendInvitation({
        invitationId: 'inv_123',
        invitedByUserId: 'user_admin',
        organizationId: orgId,
      });

      expect(result).toMatchObject({
        id: 'inv_123',
        invitedByUserId: 'user_admin',
        status: 'delivered',
      });
      expect(prisma.invitation.create).not.toHaveBeenCalled();
      expect(notificationsService.sendEmail).toHaveBeenCalledOnce();
      expect(prisma.invitation.updateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            invitedByUserId: 'user_admin',
            status: 'pending',
          }),
          where: expect.objectContaining({
            id: 'inv_123',
            isDeleted: false,
            organizationId: orgId,
            tokenHash: hashToken('token-123'),
          }),
        }),
      );
      expect(prisma.invitation.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'inv_123',
            isDeleted: false,
            organizationId: orgId,
          }),
        }),
      );
    });

    it('restores the prior token and marks delivery failed when retry transport fails', async () => {
      const { notificationsService, prisma, service } = buildService();
      const invitation = makeInvitation({ status: 'delivered' });
      prisma.invitation.findFirst.mockResolvedValue(invitation);
      prisma.organization.findFirst.mockResolvedValue({
        id: orgId,
        label: 'Acme',
      });
      prisma.invitation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      const sendEmail = notificationsService.sendEmail as unknown as MockFn;
      sendEmail.mockRejectedValue(new Error('smtp unavailable'));

      const result = await service.resendInvitation({
        invitationId: 'inv_123',
        invitedByUserId: 'user_admin',
        organizationId: orgId,
      });

      expect(result).toMatchObject({
        id: 'inv_123',
        status: 'delivery-failed',
      });
      expect(prisma.invitation.updateMany).toHaveBeenLastCalledWith({
        data: {
          expiresAt: invitation.expiresAt,
          status: 'delivery-failed',
          tokenHash: invitation.tokenHash,
          updatedAt: now,
        },
        where: expect.objectContaining({
          id: 'inv_123',
          isDeleted: false,
          organizationId: orgId,
        }),
      });
    });
  });

  describe('acceptInvitation', () => {
    it('accepts an invitation for an existing invited user and activates their member row', async () => {
      const { prisma, service } = buildService();
      const invitation = makeInvitation({ tokenHash: hashToken('token-123') });
      const inactiveMember = makeMember({ isActive: false });
      const acceptedAt = new Date('2026-06-23T12:00:00.000Z');

      prisma.invitation.findUnique.mockResolvedValue(invitation);
      prisma.invitation.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findFirst.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser({ isInvited: false }));
      prisma.member.findFirst.mockResolvedValue(inactiveMember);
      prisma.member.update.mockResolvedValue(
        makeMember({ isActive: true, roleId }),
      );
      prisma.invitation.update.mockResolvedValue(
        makeInvitation({
          acceptedAt,
          acceptedByUserId: userId,
          tokenHash: hashToken('token-123'),
        }),
      );

      const result = await service.acceptInvitation('token-123');

      expect(prisma.invitation.findUnique).toHaveBeenCalledWith({
        include: { organization: { select: { label: true } } },
        where: { tokenHash: hashToken('token-123') },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        data: {
          emailVerified: true,
          isInvited: false,
          lastUsedOrganizationId: orgId,
        },
        where: { id: userId },
      });
      expect(prisma.member.update).toHaveBeenCalledWith({
        data: {
          isActive: true,
          roleId,
          roleKey,
        },
        where: { id: memberId },
      });
      expect(prisma.setting.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        memberId,
        organizationId: orgId,
        redirectUrl: 'https://app.test/login?invitation=accepted&org=org_123',
        userId,
      });
    });

    it('creates a user, settings, and active member when no user exists', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findUnique.mockResolvedValue(makeInvitation());
      prisma.invitation.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(makeUser({ isInvited: false }));
      prisma.setting.create.mockResolvedValue({ id: 'setting_123' });
      prisma.member.findFirst.mockResolvedValue(null);
      prisma.member.create.mockResolvedValue(makeMember({ isActive: true }));
      prisma.invitation.update.mockResolvedValue(
        makeInvitation({ acceptedAt: now, acceptedByUserId: userId }),
      );

      const result = await service.acceptInvitation('token-123');

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          emailVerified: true,
          isInvited: false,
          lastUsedOrganizationId: orgId,
        }),
      });
      expect(prisma.setting.create).toHaveBeenCalledWith({
        data: { userId },
      });
      expect(prisma.member.create).toHaveBeenCalledWith({
        data: {
          isActive: true,
          organizationId: orgId,
          roleId,
          roleKey,
          userId,
        },
      });
      expect(result.memberId).toBe(memberId);
    });

    it('rejects expired invitations', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findUnique.mockResolvedValue(
        makeInvitation({ expiresAt: new Date('2026-06-22T12:00:00.000Z') }),
      );

      await expect(
        service.acceptInvitation('token-123'),
      ).rejects.toBeInstanceOf(GoneException);

      expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
    });

    it('rejects revoked invitations', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findUnique.mockResolvedValue(
        makeInvitation({ revokedAt: now }),
      );

      await expect(
        service.acceptInvitation('token-123'),
      ).rejects.toBeInstanceOf(GoneException);

      expect(prisma.invitation.updateMany).not.toHaveBeenCalled();
    });

    it('rejects duplicate acceptance without creating another member', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findUnique.mockResolvedValue(
        makeInvitation({ acceptedAt: now, acceptedByUserId: userId }),
      );

      await expect(
        service.acceptInvitation('token-123'),
      ).rejects.toBeInstanceOf(GoneException);

      expect(prisma.member.create).not.toHaveBeenCalled();
      expect(prisma.member.update).not.toHaveBeenCalled();
    });

    it('rejects a concurrent consume that already claimed the invitation', async () => {
      const { prisma, service } = buildService();
      prisma.invitation.findUnique.mockResolvedValue(makeInvitation());
      prisma.invitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.acceptInvitation('token-123'),
      ).rejects.toBeInstanceOf(GoneException);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.member.create).not.toHaveBeenCalled();
    });
  });
});
