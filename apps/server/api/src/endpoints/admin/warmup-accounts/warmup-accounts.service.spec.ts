import { InvitationService } from '@api/collections/members/services/invitation.service';
import { AdminWarmupAccountsService } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WarmupAccountStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-06-29T10:00:00.000Z');
const updatedAt = new Date('2026-06-29T10:01:00.000Z');

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
      createInvitation: vi.fn().mockResolvedValue({
        id: 'invite_1',
      }),
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
});
