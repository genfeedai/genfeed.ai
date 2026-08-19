import { InvitationService } from '@api/collections/members/services/invitation.service';
import {
  AdminWarmupAccountsService,
  createSlugSeed,
} from '@api/endpoints/admin/warmup-accounts/warmup-accounts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WarmupAccountStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, GoneException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-06-29T10:00:00.000Z');
const updatedAt = new Date('2026-06-29T10:01:00.000Z');

describe('createSlugSeed', () => {
  it('collapses invalid runs and trims separators', () => {
    expect(createSlugSeed('  --Warmup   Account--  ')).toBe('warmup-account');
  });

  it('preserves the existing fallback and length cap', () => {
    expect(createSlugSeed('---')).toBe('warmup');
    expect(createSlugSeed('a'.repeat(80))).toHaveLength(48);
  });

  it('handles long separator runs without ambiguous matching', () => {
    expect(createSlugSeed(`lead${'-'.repeat(50_000)}account`)).toBe(
      'lead-account',
    );
  });
});

function makeInvitationView(overrides: Record<string, unknown> = {}) {
  return {
    acceptedAt: null,
    createdAt,
    email: 'lead@example.com',
    expiresAt: new Date('2026-07-06T10:00:00.000Z'),
    id: 'invite_1',
    invitedByUserId: 'operator_1',
    organizationId: 'org_1',
    revokedAt: null,
    roleId: 'role_member',
    roleKey: 'member',
    status: 'pending' as const,
    tokenHash: 'should-never-leak',
    updatedAt,
    ...overrides,
  };
}

function makeWarmupAccount(overrides: Record<string, unknown> = {}) {
  return {
    auditEvents: [],
    brandId: 'brand_1',
    brandName: 'Acme',
    createdAt,
    customerUserId: 'customer_1',
    diagnostics: { steps: [] },
    guidance: null,
    id: 'warmup_1',
    invitationId: null,
    isDeleted: false,
    leadEmail: 'lead@example.com',
    leadFirstName: 'Ada',
    leadLastName: 'Lovelace',
    operatorUserId: 'operator_1',
    organizationId: 'org_1',
    organizationName: 'Acme Growth',
    status: WarmupAccountStatus.PROVISIONED,
    updatedAt,
    websiteUrl: 'https://example.com',
    ...overrides,
  };
}

describe('AdminWarmupAccountsService', () => {
  let service: AdminWarmupAccountsService;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    warmupAccount: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let tx: {
    brand: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    member: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    organization: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    role: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    user: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    warmupAccount: {
      create: ReturnType<typeof vi.fn>;
    };
  };
  let invitationService: {
    createInvitation: ReturnType<typeof vi.fn>;
    getInvitation: ReturnType<typeof vi.fn>;
    resendInvitation: ReturnType<typeof vi.fn>;
    revokeInvitation: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
  };

  const dto = {
    brandName: 'Acme',
    leadEmail: 'LEAD@example.com',
    leadFirstName: 'Ada',
    leadLastName: 'Lovelace',
    organizationName: 'Acme Growth',
    websiteUrl: 'https://example.com',
  };

  beforeEach(() => {
    tx = {
      brand: {
        create: vi.fn().mockResolvedValue({ id: 'brand_1' }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      member: {
        create: vi.fn().mockResolvedValue({ id: 'member_1' }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
      organization: {
        create: vi.fn().mockResolvedValue({ id: 'org_1' }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      role: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'role_admin', key: 'admin' }),
      },
      user: {
        create: vi.fn().mockResolvedValue({ id: 'customer_1' }),
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: 'operator_1' })
          .mockResolvedValueOnce(null),
      },
      warmupAccount: {
        create: vi
          .fn()
          .mockResolvedValue(makeWarmupAccount({ status: 'PROVISIONED' })),
      },
    };

    prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
      warmupAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(
          makeWarmupAccount({
            invitationId: 'invite_1',
            status: WarmupAccountStatus.INVITED,
          }),
        ),
      },
    };

    invitationService = {
      createInvitation: vi.fn().mockResolvedValue(makeInvitationView()),
      getInvitation: vi.fn().mockResolvedValue(makeInvitationView()),
      resendInvitation: vi
        .fn()
        .mockResolvedValue(makeInvitationView({ status: 'delivered' })),
      revokeInvitation: vi.fn().mockResolvedValue(
        makeInvitationView({
          revokedAt: updatedAt,
          status: 'revoked',
        }),
      ),
    };

    logger = {
      error: vi.fn(),
    };

    service = new AdminWarmupAccountsService(
      prisma as unknown as PrismaService,
      invitationService as unknown as InvitationService,
      logger as unknown as LoggerService,
    );
  });

  it('returns an existing active warm-up account for duplicate lead email', async () => {
    prisma.warmupAccount.findFirst.mockResolvedValue(
      makeWarmupAccount({ status: WarmupAccountStatus.INVITED }),
    );

    const result = await service.create('operator_1', dto);

    expect(result.status).toBe('INVITED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(invitationService.createInvitation).not.toHaveBeenCalled();
  });

  it('provisions the account resources and creates a pending invitation', async () => {
    const result = await service.create('operator_1', dto);

    expect(tx.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          label: 'Acme Growth',
          userId: 'customer_1',
        }),
      }),
    );
    expect(tx.brand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          label: 'Acme',
          organizationId: 'org_1',
          userId: 'customer_1',
        }),
      }),
    );
    expect(tx.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org_1',
          roleKey: 'admin',
          userId: 'operator_1',
        }),
      }),
    );
    expect(invitationService.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'lead@example.com',
        invitedByUserId: 'operator_1',
        organizationId: 'org_1',
        sendEmail: false,
      }),
    );
    expect(result.status).toBe('INVITED');
    expect(result.invitationId).toBe('invite_1');
  });

  it('records a failed status with diagnostics when invitation creation fails', async () => {
    invitationService.createInvitation.mockRejectedValue(
      new Error('Invitation disabled'),
    );
    prisma.warmupAccount.update.mockResolvedValue(
      makeWarmupAccount({
        diagnostics: {
          error: 'Invitation disabled',
          steps: [
            {
              message: 'Failed to create pending customer invitation.',
              status: 'failed',
              timestamp: '2026-06-29T10:02:00.000Z',
            },
          ],
        },
        status: WarmupAccountStatus.FAILED,
      }),
    );

    const result = await service.create('operator_1', dto);

    expect(logger.error).toHaveBeenCalled();
    expect(result.status).toBe('FAILED');
    expect(result.diagnostics.error).toBe('Invitation disabled');
  });

  it('inspects invitation lifecycle state without token material', async () => {
    prisma.warmupAccount.findFirst.mockResolvedValue(
      makeWarmupAccount({
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );

    const result = await service.inspectInvitation('warmup_1');

    expect(invitationService.getInvitation).toHaveBeenCalledWith(
      'invite_1',
      'org_1',
    );
    expect(result.invitation).toMatchObject({
      email: 'lead@example.com',
      id: 'invite_1',
      status: 'pending',
    });
    expect(result.invitation).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(result)).not.toContain('should-never-leak');
  });

  it('sends a pending invitation and records the dispatch', async () => {
    const account = makeWarmupAccount({
      invitationId: 'invite_1',
      status: WarmupAccountStatus.INVITED,
    });
    prisma.warmupAccount.findFirst.mockResolvedValue(account);
    prisma.warmupAccount.update.mockResolvedValue(
      makeWarmupAccount({
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );

    const result = await service.sendInvitation('warmup_1', 'operator_1');

    expect(invitationService.resendInvitation).toHaveBeenCalledWith({
      invitationId: 'invite_1',
      invitedByUserId: 'operator_1',
      organizationId: 'org_1',
    });
    expect(prisma.warmupAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WarmupAccountStatus.INVITED,
        }),
        where: {
          id: 'warmup_1',
          isDeleted: false,
          organizationId: 'org_1',
        },
      }),
    );
    expect(result.invitation?.status).toBe('delivered');
  });

  it('does not re-dispatch when send is requested for an already delivered invitation', async () => {
    prisma.warmupAccount.findFirst.mockResolvedValue(
      makeWarmupAccount({
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );
    invitationService.getInvitation.mockResolvedValue(
      makeInvitationView({ status: 'delivered' }),
    );
    prisma.warmupAccount.update.mockResolvedValue(
      makeWarmupAccount({
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );

    const result = await service.sendInvitation('warmup_1', 'operator_1');

    expect(invitationService.resendInvitation).not.toHaveBeenCalled();
    expect(invitationService.createInvitation).not.toHaveBeenCalled();
    expect(result.invitation?.status).toBe('delivered');
  });

  it('creates and dispatches a missing invitation on send', async () => {
    prisma.warmupAccount.findFirst.mockResolvedValue(
      makeWarmupAccount({
        invitationId: null,
        status: WarmupAccountStatus.FAILED,
      }),
    );
    invitationService.getInvitation.mockRejectedValue(
      new Error('should not be called'),
    );
    invitationService.createInvitation.mockResolvedValue(
      makeInvitationView({ status: 'delivered' }),
    );
    prisma.warmupAccount.update.mockResolvedValue(
      makeWarmupAccount({
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );

    const result = await service.sendInvitation('warmup_1', 'operator_1');

    expect(invitationService.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'lead@example.com',
        sendEmail: true,
      }),
    );
    expect(result.status).toBe('INVITED');
    expect(result.invitation?.status).toBe('delivered');
  });

  it('retries a failed delivery without leaving a non-retryable status', async () => {
    prisma.warmupAccount.findFirst.mockResolvedValue(
      makeWarmupAccount({
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );
    invitationService.getInvitation.mockResolvedValue(
      makeInvitationView({ status: 'delivery-failed' }),
    );
    invitationService.resendInvitation.mockResolvedValue(
      makeInvitationView({ status: 'delivery-failed' }),
    );
    prisma.warmupAccount.update.mockResolvedValue(
      makeWarmupAccount({
        diagnostics: {
          error:
            'Invitation email could not be delivered. Retry send when email delivery is available.',
          steps: [
            {
              message:
                'Invitation email dispatch failed. The invitation remains retryable.',
              status: 'failed',
              timestamp: '2026-06-29T10:02:00.000Z',
            },
          ],
        },
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );

    const result = await service.resendInvitation('warmup_1', 'operator_1');

    expect(invitationService.resendInvitation).toHaveBeenCalledWith({
      invitationId: 'invite_1',
      invitedByUserId: 'operator_1',
      organizationId: 'org_1',
    });
    expect(result.status).toBe('INVITED');
    expect(result.invitation?.status).toBe('delivery-failed');
    expect(result.diagnostics.error).toContain('Retry send');
    expect(logger.error).toHaveBeenCalled();
  });

  it('revokes an invitation and records the actor transition', async () => {
    prisma.warmupAccount.findFirst.mockResolvedValue(
      makeWarmupAccount({
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );
    prisma.warmupAccount.update.mockResolvedValue(
      makeWarmupAccount({
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );

    const result = await service.revokeInvitation('warmup_1', 'operator_1');

    expect(invitationService.revokeInvitation).toHaveBeenCalledWith(
      'invite_1',
      'org_1',
    );
    expect(prisma.warmupAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          auditEvents: expect.arrayContaining([
            expect.objectContaining({
              actorUserId: 'operator_1',
              message: 'Revoked invitation invite_1.',
            }),
          ]),
        }),
      }),
    );
    expect(result.invitation?.status).toBe('revoked');
  });

  it('does not send or resend after the invitation has been accepted or revoked', async () => {
    prisma.warmupAccount.findFirst.mockResolvedValue(
      makeWarmupAccount({
        invitationId: 'invite_1',
        status: WarmupAccountStatus.INVITED,
      }),
    );
    invitationService.getInvitation.mockResolvedValue(
      makeInvitationView({ acceptedAt: updatedAt, status: 'accepted' }),
    );
    invitationService.resendInvitation.mockRejectedValue(
      new ConflictException('Invitation has already been accepted'),
    );

    await expect(
      service.sendInvitation('warmup_1', 'operator_1'),
    ).rejects.toBeInstanceOf(ConflictException);

    invitationService.getInvitation.mockResolvedValue(
      makeInvitationView({ revokedAt: updatedAt, status: 'revoked' }),
    );
    invitationService.resendInvitation.mockRejectedValue(
      new GoneException('Invitation has already been revoked'),
    );

    await expect(
      service.resendInvitation('warmup_1', 'operator_1'),
    ).rejects.toBeInstanceOf(GoneException);
    expect(prisma.warmupAccount.update).not.toHaveBeenCalled();
  });
});
