/**
 * Real-Postgres coverage for the Genfeed-owned member invitation lifecycle.
 * The notification transport is an in-memory mock, so this suite never sends
 * production email or depends on Better Auth's invitation implementation.
 */

import { InvitationService } from '@api/collections/members/services/invitation.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createTestOrganization,
  createTestUser,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import { E2ETestModule, TestDatabaseHelper } from '@api-test/e2e-test.module';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { GoneException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

const describeWithDatabase =
  process.env.SKIP_PRISMA_DB === 'true' ? describe.skip : describe;

const extractToken = (html: string): string => {
  const token = html.match(/accept-invitation\?token=([^"<]+)/)?.[1];
  if (!token) {
    throw new Error('The hermetic invitation email did not contain a token');
  }
  return decodeURIComponent(token.replace(/&amp;.*/, ''));
};

describeWithDatabase('Member invitation lifecycle integration', () => {
  let dbHelper: TestDatabaseHelper;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: InvitationService;

  const sendEmail = vi.fn();
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let inviterId: string;
  let memberRoleId: string;
  let adminRoleId: string;
  let organizationId: string;

  beforeAll(async () => {
    const moduleConfig = await E2ETestModule.forRoot();
    moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    dbHelper = new TestDatabaseHelper(prisma);

    const config = {
      get: vi.fn((key: string) => {
        if (key === 'GENFEEDAI_API_URL') {
          return 'https://api.example.test';
        }
        if (key === 'GENFEEDAI_APP_URL') {
          return 'https://app.example.test';
        }
        return undefined;
      }),
    };

    service = new InvitationService(
      prisma,
      config as unknown as ConfigService,
      { sendEmail } as unknown as NotificationsService,
      logger as unknown as LoggerService,
    );
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    sendEmail.mockResolvedValue(undefined);
    await dbHelper.clearDatabase();

    inviterId = generateIdString();
    organizationId = generateIdString();
    memberRoleId = generateIdString();
    adminRoleId = generateIdString();

    await prisma.user.create({
      data: createTestUser({
        email: `owner-${inviterId}@example.test`,
        handle: `owner-${inviterId}`,
        id: inviterId,
      }),
    });
    await prisma.organization.create({
      data: createTestOrganization({
        id: organizationId,
        label: 'Invitation Test Organization',
        slug: `invitation-${organizationId}`,
        userId: inviterId,
      }),
    });
    await prisma.role.createMany({
      data: [
        { id: memberRoleId, key: 'member', label: 'Member' },
        { id: adminRoleId, key: 'admin', label: 'Admin' },
      ],
    });
  });

  afterAll(async () => {
    await dbHelper.clearDatabase();
    await moduleRef.close();
  });

  it.each([
    { existingUser: false, label: 'new invitee' },
    { existingUser: true, label: 'existing invitee' },
  ])(
    'accepts a $label once with the intended organization and role',
    async ({ existingUser }) => {
      const email = `${existingUser ? 'existing' : 'new'}-${generateIdString()}@example.test`;
      let existingUserId: string | undefined;

      if (existingUser) {
        existingUserId = generateIdString();
        await prisma.user.create({
          data: createTestUser({
            email,
            handle: `existing-${existingUserId}`,
            id: existingUserId,
          }),
        });
      }

      const invitation = await service.createInvitation({
        email,
        invitedByUserId: inviterId,
        organizationId,
        redirectUrl: `https://app.example.test/login?org=${organizationId}`,
        roleId: adminRoleId,
      });
      const token = extractToken(sendEmail.mock.calls.at(-1)?.[2] as string);

      expect(invitation).toMatchObject({
        email,
        organizationId,
        roleId: adminRoleId,
        roleKey: 'admin',
        status: 'delivered',
      });
      expect(await prisma.member.count({ where: { organizationId } })).toBe(0);

      const accepted = await service.acceptInvitation(token);
      const member = await prisma.member.findUniqueOrThrow({
        where: { id: accepted.memberId },
      });
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: accepted.userId },
      });

      expect(member).toMatchObject({
        isActive: true,
        organizationId,
        roleId: adminRoleId,
        roleKey: 'admin',
        userId: user.id,
      });
      expect(user.email).toBe(email);
      if (existingUserId) {
        expect(user.id).toBe(existingUserId);
      }
      expect(accepted.invitation.status).toBe('accepted');
      expect(accepted.redirectUrl).toContain('invitation=accepted');
      expect(accepted.redirectUrl).toContain(`org=${organizationId}`);
      await expect(service.acceptInvitation(token)).rejects.toBeInstanceOf(
        GoneException,
      );
      expect(
        await prisma.member.count({
          where: { organizationId, userId: user.id },
        }),
      ).toBe(1);
    },
  );

  it('rejects expired and revoked invitations without creating membership', async () => {
    const expiredEmail = `expired-${generateIdString()}@example.test`;
    await service.createInvitation({
      email: expiredEmail,
      expiresAt: new Date(Date.now() - 60_000),
      invitedByUserId: inviterId,
      organizationId,
      roleId: memberRoleId,
    });
    const expiredToken = extractToken(
      sendEmail.mock.calls.at(-1)?.[2] as string,
    );

    await expect(service.acceptInvitation(expiredToken)).rejects.toThrow(
      'Invitation has expired',
    );

    const revokedEmail = `revoked-${generateIdString()}@example.test`;
    const revocable = await service.createInvitation({
      email: revokedEmail,
      invitedByUserId: inviterId,
      organizationId,
      roleId: memberRoleId,
    });
    const revokedToken = extractToken(
      sendEmail.mock.calls.at(-1)?.[2] as string,
    );
    const revoked = await service.revokeInvitation(
      revocable.id,
      organizationId,
    );

    expect(revoked.status).toBe('revoked');
    await expect(service.acceptInvitation(revokedToken)).rejects.toThrow(
      'Invitation has been revoked',
    );
    expect(await service.listInvitations(organizationId, 'revoked')).toEqual([
      expect.objectContaining({ id: revocable.id, status: 'revoked' }),
    ]);
    expect(await prisma.member.count({ where: { organizationId } })).toBe(0);
  });

  it('retries delivery idempotently on the same record and invalidates older links', async () => {
    const email = `retry-${generateIdString()}@example.test`;
    sendEmail.mockRejectedValueOnce(new Error('Hermetic transport failure'));
    const failed = await service.createInvitation({
      email,
      invitedByUserId: inviterId,
      organizationId,
      roleId: memberRoleId,
    });

    expect(failed.status).toBe('delivery-failed');
    sendEmail.mockResolvedValue(undefined);
    const firstRetry = await service.resendInvitation({
      invitationId: failed.id,
      invitedByUserId: inviterId,
      organizationId,
    });
    const staleToken = extractToken(sendEmail.mock.calls.at(-1)?.[2] as string);
    const secondRetry = await service.resendInvitation({
      invitationId: failed.id,
      invitedByUserId: inviterId,
      organizationId,
    });
    const currentToken = extractToken(
      sendEmail.mock.calls.at(-1)?.[2] as string,
    );

    expect(firstRetry).toMatchObject({ id: failed.id, status: 'delivered' });
    expect(secondRetry).toMatchObject({ id: failed.id, status: 'delivered' });
    expect(
      await prisma.invitation.count({
        where: { email, isDeleted: false, organizationId },
      }),
    ).toBe(1);
    await expect(service.acceptInvitation(staleToken)).rejects.toThrow(
      'Invitation not found',
    );
    await service.acceptInvitation(currentToken);
    expect(await prisma.member.count({ where: { organizationId } })).toBe(1);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(email);
  });

  it('supersedes a duplicate invite so only the newest link can be accepted', async () => {
    const email = `duplicate-${generateIdString()}@example.test`;
    const first = await service.createInvitation({
      email,
      invitedByUserId: inviterId,
      organizationId,
      roleId: memberRoleId,
    });
    const staleToken = extractToken(sendEmail.mock.calls.at(-1)?.[2] as string);
    const second = await service.createInvitation({
      email,
      invitedByUserId: inviterId,
      organizationId,
      roleId: adminRoleId,
    });
    const currentToken = extractToken(
      sendEmail.mock.calls.at(-1)?.[2] as string,
    );

    expect(second.id).not.toBe(first.id);
    expect(
      await prisma.invitation.count({
        where: { email, isDeleted: false, organizationId },
      }),
    ).toBe(1);
    await expect(service.acceptInvitation(staleToken)).rejects.toThrow(
      'Invitation not found',
    );
    const accepted = await service.acceptInvitation(currentToken);
    expect(accepted.invitation).toMatchObject({
      id: second.id,
      roleId: adminRoleId,
      roleKey: 'admin',
      status: 'accepted',
    });
  });

  it('does not disclose or mutate an invitation across organization boundaries', async () => {
    const otherOwnerId = generateIdString();
    const otherOrganizationId = generateIdString();
    await prisma.user.create({
      data: createTestUser({
        email: `other-owner-${otherOwnerId}@example.test`,
        handle: `other-owner-${otherOwnerId}`,
        id: otherOwnerId,
      }),
    });
    await prisma.organization.create({
      data: createTestOrganization({
        id: otherOrganizationId,
        slug: `other-invitation-${otherOrganizationId}`,
        userId: otherOwnerId,
      }),
    });
    const invitation = await service.createInvitation({
      email: `tenant-${generateIdString()}@example.test`,
      invitedByUserId: inviterId,
      organizationId,
      roleId: memberRoleId,
    });

    await expect(
      service.revokeInvitation(invitation.id, otherOrganizationId),
    ).rejects.toThrow('Invitation not found');
    expect(await service.listInvitations(otherOrganizationId)).toEqual([]);
    expect(await service.listInvitations(organizationId)).toEqual([
      expect.objectContaining({ id: invitation.id, status: 'delivered' }),
    ]);
  });
});
