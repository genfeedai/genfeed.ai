import { randomUUID } from 'node:crypto';
import { InvitationService } from '@api/collections/members/services/invitation.service';
import { CreateWarmupAccountDto } from '@api/endpoints/admin/warmup-accounts/dto/create-warmup-account.dto';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import type {
  IWarmupAccount,
  IWarmupAccountAuditEvent,
  IWarmupAccountDiagnosticStep,
  IWarmupAccountDiagnostics,
} from '@genfeedai/interfaces';
import {
  OrganizationCategory,
  type Prisma,
  type Role,
  type User,
  type WarmupAccount,
  WarmupAccountStatus,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { BadRequestException, Injectable } from '@nestjs/common';

type WarmupAccountView = IWarmupAccount & { _id: string };
type WarmupTransaction = Prisma.TransactionClient;
type RoleAssignment = Pick<Role, 'id' | 'key'>;
type CustomerUser = Pick<User, 'id'>;

const ACTIVE_WARMUP_STATUSES: WarmupAccountStatus[] = [
  WarmupAccountStatus.DRAFT,
  WarmupAccountStatus.PROVISIONING,
  WarmupAccountStatus.PROVISIONED,
  WarmupAccountStatus.INVITED,
];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function makeTimestamp(): string {
  return new Date().toISOString();
}

function createSlugSeed(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'warmup'
  );
}

function createHandle(email: string): string {
  const seed = createSlugSeed(email.split('@')[0] ?? 'lead').slice(0, 24);
  return `${seed}-${randomUUID().slice(0, 8)}`;
}

function createAuditEvent(
  actorUserId: string,
  message: string,
): IWarmupAccountAuditEvent {
  return {
    actorUserId,
    message,
    timestamp: makeTimestamp(),
  };
}

function createDiagnosticStep(
  status: IWarmupAccountDiagnosticStep['status'],
  message: string,
): IWarmupAccountDiagnosticStep {
  return {
    message,
    status,
    timestamp: makeTimestamp(),
  };
}

@Injectable()
export class AdminWarmupAccountsService {
  private readonly context = { service: AdminWarmupAccountsService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly invitationService: InvitationService,
    private readonly logger: LoggerService,
  ) {}

  async create(
    operatorUserId: string,
    dto: CreateWarmupAccountDto,
  ): Promise<WarmupAccountView> {
    const leadEmail = normalizeEmail(dto.leadEmail);
    const existing = await this.prisma.warmupAccount.findFirst({
      orderBy: { createdAt: 'desc' },
      where: {
        isDeleted: false,
        leadEmail,
        status: { in: ACTIVE_WARMUP_STATUSES },
      },
    });

    if (existing) {
      return this.toView(existing);
    }

    const provisioned = await this.prisma.$transaction((tx) =>
      this.provisionWarmupAccount(tx, operatorUserId, leadEmail, dto),
    );

    return this.createInvitation(provisioned, operatorUserId);
  }

  async get(id: string): Promise<WarmupAccountView> {
    const account = await findOrThrow(
      this.prisma.warmupAccount,
      { where: { id, isDeleted: false } },
      'Warm-up account',
    );

    return this.toView(account);
  }

  async list(): Promise<WarmupAccountView[]> {
    const accounts = await this.prisma.warmupAccount.findMany({
      orderBy: { createdAt: 'desc' },
      where: { isDeleted: false },
    });

    return accounts.map((account) => this.toView(account));
  }

  private async provisionWarmupAccount(
    tx: WarmupTransaction,
    operatorUserId: string,
    leadEmail: string,
    dto: CreateWarmupAccountDto,
  ): Promise<WarmupAccount> {
    await this.assertOperatorUser(tx, operatorUserId);

    const customerUser = await this.findOrCreateCustomerUser(
      tx,
      leadEmail,
      dto,
    );
    const organizationSlug = await this.createUniqueOrganizationSlug(
      tx,
      dto.organizationName,
    );
    const brandSlug = await this.createUniqueBrandSlug(tx, dto.brandName);

    const organization = await tx.organization.create({
      data: {
        accountType: OrganizationCategory.BUSINESS,
        category: OrganizationCategory.BUSINESS,
        isProactiveOnboarding: true,
        label: dto.organizationName.trim(),
        onboardingCompleted: false,
        slug: organizationSlug,
        userId: customerUser.id,
      },
      select: { id: true },
    });

    const brand = await tx.brand.create({
      data: {
        isSelected: true,
        label: dto.brandName.trim(),
        organizationId: organization.id,
        slug: brandSlug,
        text: trimOptional(dto.guidance),
        userId: customerUser.id,
      },
      select: { id: true },
    });

    await this.ensureOperatorMember(tx, {
      brandId: brand.id,
      operatorUserId,
      organizationId: organization.id,
    });

    return tx.warmupAccount.create({
      data: {
        auditEvents: [
          createAuditEvent(
            operatorUserId,
            'Provisioned warm-up organization and first brand.',
          ),
        ] as Prisma.InputJsonValue,
        brandId: brand.id,
        brandName: dto.brandName.trim(),
        customerUserId: customerUser.id,
        diagnostics: {
          steps: [
            createDiagnosticStep('done', 'Created or reused lead user.'),
            createDiagnosticStep('done', 'Created warm-up organization.'),
            createDiagnosticStep('done', 'Created first brand workspace.'),
            createDiagnosticStep('done', 'Granted operator member access.'),
          ],
        } as Prisma.InputJsonValue,
        guidance: trimOptional(dto.guidance),
        leadEmail,
        leadFirstName: trimOptional(dto.leadFirstName),
        leadLastName: trimOptional(dto.leadLastName),
        operatorUserId,
        organizationId: organization.id,
        organizationName: dto.organizationName.trim(),
        status: WarmupAccountStatus.PROVISIONED,
        websiteUrl: trimOptional(dto.websiteUrl),
      },
    });
  }

  private async createInvitation(
    account: WarmupAccount,
    operatorUserId: string,
  ): Promise<WarmupAccountView> {
    if (!account.organizationId) {
      throw new BadRequestException('Warm-up organization is missing');
    }

    try {
      const invitation = await this.invitationService.createInvitation({
        defaultRoleKey: 'member',
        email: account.leadEmail,
        firstName: account.leadFirstName ?? undefined,
        invitedByUserId: operatorUserId,
        lastName: account.leadLastName ?? undefined,
        organizationId: account.organizationId,
        redirectUrl: `/login?warmupAccountId=${account.id}`,
        sendEmail: false,
      });

      const updated = await this.prisma.warmupAccount.update({
        data: {
          auditEvents: this.appendAuditEvent(
            account,
            operatorUserId,
            `Created pending invitation ${invitation.id}.`,
          ) as Prisma.InputJsonValue,
          diagnostics: this.appendDiagnosticStep(
            account,
            'done',
            'Created pending customer invitation.',
          ) as Prisma.InputJsonValue,
          invitationId: invitation.id,
          status: WarmupAccountStatus.INVITED,
        },
        where: { id: account.id },
      });

      return this.toView(updated);
    } catch (error) {
      this.logger.error('Warm-up invitation provisioning failed', {
        ...this.context,
        error: getErrorMessage(error),
        warmupAccountId: account.id,
      });

      const failed = await this.prisma.warmupAccount.update({
        data: {
          auditEvents: this.appendAuditEvent(
            account,
            operatorUserId,
            'Invitation provisioning failed.',
          ) as Prisma.InputJsonValue,
          diagnostics: this.appendDiagnosticStep(
            account,
            'failed',
            'Failed to create pending customer invitation.',
            error,
          ) as Prisma.InputJsonValue,
          status: WarmupAccountStatus.FAILED,
        },
        where: { id: account.id },
      });

      return this.toView(failed);
    }
  }

  private async assertOperatorUser(
    tx: WarmupTransaction,
    operatorUserId: string,
  ): Promise<void> {
    const operator = await tx.user.findFirst({
      select: { id: true },
      where: { id: operatorUserId, isDeleted: false },
    });

    if (!operator) {
      throw new BadRequestException('Operator user not found');
    }
  }

  private async findOrCreateCustomerUser(
    tx: WarmupTransaction,
    leadEmail: string,
    dto: CreateWarmupAccountDto,
  ): Promise<CustomerUser> {
    const existing = await tx.user.findFirst({
      select: { id: true },
      where: { email: leadEmail, isDeleted: false },
    });

    if (existing) {
      return existing;
    }

    const name = [
      trimOptional(dto.leadFirstName),
      trimOptional(dto.leadLastName),
    ]
      .filter(Boolean)
      .join(' ');

    return tx.user.create({
      data: {
        email: leadEmail,
        firstName: trimOptional(dto.leadFirstName),
        handle: createHandle(leadEmail),
        isInvited: true,
        lastName: trimOptional(dto.leadLastName),
        name: name || undefined,
      },
      select: { id: true },
    });
  }

  private async ensureOperatorMember(
    tx: WarmupTransaction,
    input: {
      brandId: string;
      operatorUserId: string;
      organizationId: string;
    },
  ): Promise<void> {
    const existing = await tx.member.findFirst({
      select: { id: true },
      where: {
        isDeleted: false,
        organizationId: input.organizationId,
        userId: input.operatorUserId,
      },
    });

    if (existing) {
      await tx.member.update({
        data: {
          isActive: true,
          lastUsedBrandId: input.brandId,
        },
        where: { id: existing.id },
      });
      return;
    }

    const role = await this.resolveOperatorRole(tx);
    await tx.member.create({
      data: {
        isActive: true,
        lastUsedBrandId: input.brandId,
        organizationId: input.organizationId,
        roleId: role.id,
        roleKey: role.key,
        userId: input.operatorUserId,
      },
    });
  }

  private async resolveOperatorRole(
    tx: WarmupTransaction,
  ): Promise<RoleAssignment> {
    const role = await tx.role.findFirst({
      select: { id: true, key: true },
      where: {
        isDeleted: false,
        key: 'admin',
      },
    });

    if (!role) {
      throw new BadRequestException(
        'Admin role is not configured — warm-up provisioning requires an admin role',
      );
    }

    return role;
  }

  private async createUniqueOrganizationSlug(
    tx: WarmupTransaction,
    value: string,
  ): Promise<string> {
    const seed = createSlugSeed(value);
    return this.createUniqueSlug(seed, (slug) =>
      tx.organization.findFirst({
        select: { id: true },
        where: { slug },
      }),
    );
  }

  private async createUniqueBrandSlug(
    tx: WarmupTransaction,
    value: string,
  ): Promise<string> {
    const seed = createSlugSeed(value);
    return this.createUniqueSlug(seed, (slug) =>
      tx.brand.findFirst({
        select: { id: true },
        where: { slug },
      }),
    );
  }

  private async createUniqueSlug(
    seed: string,
    findExisting: (slug: string) => Promise<{ id: string } | null>,
  ): Promise<string> {
    for (let index = 0; index < 10; index += 1) {
      const candidate = index === 0 ? seed : `${seed}-${index + 1}`;
      const existing = await findExisting(candidate);

      if (!existing) {
        return candidate;
      }
    }

    return `${seed}-${randomUUID().slice(0, 8)}`;
  }

  private appendAuditEvent(
    account: WarmupAccount,
    actorUserId: string,
    message: string,
  ): IWarmupAccountAuditEvent[] {
    return [
      ...(account.auditEvents as unknown as IWarmupAccountAuditEvent[]),
      createAuditEvent(actorUserId, message),
    ];
  }

  private appendDiagnosticStep(
    account: WarmupAccount,
    status: IWarmupAccountDiagnosticStep['status'],
    message: string,
    error?: unknown,
  ): IWarmupAccountDiagnostics {
    return {
      ...(account.diagnostics as unknown as IWarmupAccountDiagnostics),
      error: error ? getErrorMessage(error) : undefined,
      steps: [
        ...((account.diagnostics as unknown as IWarmupAccountDiagnostics)
          .steps ?? []),
        createDiagnosticStep(status, message),
      ],
    };
  }

  private toView(account: WarmupAccount): WarmupAccountView {
    return {
      _id: account.id,
      auditEvents: account.auditEvents as unknown as IWarmupAccountAuditEvent[],
      brandId: account.brandId ?? undefined,
      brandName: account.brandName,
      createdAt: account.createdAt.toISOString(),
      customerUserId: account.customerUserId ?? undefined,
      diagnostics: account.diagnostics as unknown as IWarmupAccountDiagnostics,
      guidance: account.guidance ?? undefined,
      id: account.id,
      invitationId: account.invitationId ?? undefined,
      leadEmail: account.leadEmail,
      leadFirstName: account.leadFirstName ?? undefined,
      leadLastName: account.leadLastName ?? undefined,
      operatorUserId: account.operatorUserId,
      organizationId: account.organizationId ?? undefined,
      organizationName: account.organizationName,
      status: account.status,
      updatedAt: account.updatedAt.toISOString(),
      websiteUrl: account.websiteUrl ?? undefined,
    };
  }
}
