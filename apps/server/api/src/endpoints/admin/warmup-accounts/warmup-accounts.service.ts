import { randomUUID } from 'node:crypto';
import {
  InvitationService,
  type InvitationView,
} from '@api/collections/members/services/invitation.service';
import { CreateWarmupAccountDto } from '@api/endpoints/admin/warmup-accounts/dto/create-warmup-account.dto';
import {
  assertWarmupMutable,
  lockWarmup,
  reconcileWarmupWorkspace,
  warmupReadiness,
} from '@api/endpoints/admin/warmup-accounts/warmup-workspace';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  replaceCharacterRuns,
  trimCharacter,
} from '@api/shared/utils/string/linear-string.util';
import type {
  IWarmupAccount,
  IWarmupAccountAuditEvent,
  IWarmupAccountDiagnosticStep,
  IWarmupAccountDiagnostics,
  IWarmupInvitation,
} from '@genfeedai/contracts/interfaces';
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
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
} from '@nestjs/common';

type WarmupAccountView = IWarmupAccount;
type WarmupTransaction = Prisma.TransactionClient;
type RoleAssignment = Pick<Role, 'id' | 'key'>;
type CustomerUser = Pick<User, 'id'>;

const ACTIVE_WARMUP_STATUSES: WarmupAccountStatus[] = [
  WarmupAccountStatus.FAILED,
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

function isSlugCharacter(character: string): boolean {
  const code = character.charCodeAt(0);

  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

export function createSlugSeed(value: string): string {
  const normalized = replaceCharacterRuns(
    value.trim().toLowerCase(),
    (character) => !isSlugCharacter(character),
    '-',
  );

  return trimCharacter(normalized, '-').slice(0, 48) || 'warmup';
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

function toSafeInvitation(invitation: InvitationView): IWarmupInvitation {
  return {
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
    email: invitation.email,
    expiresAt: invitation.expiresAt.toISOString(),
    id: invitation.id,
    invitedByUserId: invitation.invitedByUserId,
    organizationId: invitation.organizationId,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    roleKey: invitation.roleKey,
    status: invitation.status,
    updatedAt: invitation.updatedAt.toISOString(),
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
    const account = await this.prisma.$transaction(async (tx) => {
      await lockWarmup(tx, leadEmail);
      const existing = await tx.warmupAccount.findFirst({
        orderBy: { createdAt: 'desc' },
        where: {
          isDeleted: false,
          leadEmail,
          status: { in: ACTIVE_WARMUP_STATUSES },
        },
      });
      const account =
        existing ??
        (await this.provisionWarmupAccount(tx, operatorUserId, leadEmail, dto));
      await reconcileWarmupWorkspace(tx, account);
      return account;
    });
    return this.inspectInvitation(account.id);
  }

  async get(id: string): Promise<WarmupAccountView> {
    return this.inspectInvitation(id);
  }

  async inspectInvitation(id: string): Promise<WarmupAccountView> {
    const account = await this.getAccount(id);
    const invitation = await this.loadInvitation(account);

    return {
      ...this.toView(account, invitation),
      readiness: await warmupReadiness(this.prisma, account),
    };
  }

  async sendInvitation(
    id: string,
    actorUserId: string,
  ): Promise<WarmupAccountView> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockWarmup(tx, id);
        return this.sendInvitationLocked(id, actorUserId);
      },
      { timeout: 120000 },
    );
  }

  private async sendInvitationLocked(
    id: string,
    actorUserId: string,
  ): Promise<WarmupAccountView> {
    const account = await this.getAccount(id);
    const organizationId = this.assertOrganizationId(account);
    const existing = await this.loadInvitation(account);
    this.assertInvitationMutable(existing);
    await this.assertReadyToInvite(account, actorUserId);

    if (existing?.status === 'delivered') {
      const updated = await this.persistInvitationTransition(account, {
        actorUserId,
        auditMessage: `Send skipped; invitation ${existing.id} already delivered.`,
        diagnosticMessage: 'Invitation already delivered; send is idempotent.',
        diagnosticStatus: 'done',
      });

      return this.toView(updated, existing);
    }

    const invitation = existing
      ? await this.invitationService.resendInvitation({
          invitationId: existing.id,
          invitedByUserId: actorUserId,
          organizationId,
        })
      : await this.dispatchNewInvitation(account, actorUserId);

    return this.recordDispatchResult(account, actorUserId, invitation, 'send');
  }

  async resendInvitation(
    id: string,
    actorUserId: string,
  ): Promise<WarmupAccountView> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockWarmup(tx, id);
        return this.resendInvitationLocked(id, actorUserId);
      },
      { timeout: 120000 },
    );
  }

  private async resendInvitationLocked(
    id: string,
    actorUserId: string,
  ): Promise<WarmupAccountView> {
    const account = await this.getAccount(id);
    const organizationId = this.assertOrganizationId(account);
    const existing = await this.requireInvitation(account);
    this.assertInvitationMutable(existing);
    await this.assertReadyToInvite(account, actorUserId);

    const invitation = await this.invitationService.resendInvitation({
      invitationId: existing.id,
      invitedByUserId: actorUserId,
      organizationId,
    });

    return this.recordDispatchResult(
      account,
      actorUserId,
      invitation,
      'resend',
    );
  }

  async revokeInvitation(
    id: string,
    actorUserId: string,
  ): Promise<WarmupAccountView> {
    return this.prisma.$transaction(
      async (tx) => {
        await lockWarmup(tx, id);
        return this.revokeInvitationLocked(id, actorUserId);
      },
      { timeout: 120000 },
    );
  }

  private async revokeInvitationLocked(
    id: string,
    actorUserId: string,
  ): Promise<WarmupAccountView> {
    const account = await this.getAccount(id);
    const organizationId = this.assertOrganizationId(account);
    const existing = await this.requireInvitation(account);

    const invitation = await this.invitationService.revokeInvitation(
      existing.id,
      organizationId,
    );

    const updated = await this.persistInvitationTransition(account, {
      actorUserId,
      auditMessage: `Revoked invitation ${invitation.id}.`,
      diagnosticMessage: 'Invitation revoked; it can no longer be accepted.',
      diagnosticStatus: 'done',
    });

    return this.toView(updated, invitation);
  }

  async list(): Promise<WarmupAccountView[]> {
    const accounts = await this.prisma.warmupAccount.findMany({
      orderBy: { createdAt: 'desc' },
      where: { isDeleted: false },
    });

    return Promise.all(
      accounts.map(async (account) => ({
        ...this.toView(account),
        readiness: await warmupReadiness(this.prisma, account),
      })),
    );
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
    if (customerUser.id === operatorUserId)
      throw new BadRequestException(
        'The customer must be different from the preparation operator',
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
        ] as unknown as Prisma.InputJsonValue,
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
        } as unknown as Prisma.InputJsonValue,
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

  private assertInvitationMutable(invitation?: InvitationView): void {
    if (invitation?.status === 'accepted')
      throw new ConflictException('Invitation has already been accepted');
    if (invitation?.status === 'revoked')
      throw new GoneException('Invitation has already been revoked');
  }

  private async assertReadyToInvite(
    account: WarmupAccount,
    actorUserId: string,
  ): Promise<void> {
    assertWarmupMutable(account);
    const readiness = await warmupReadiness(this.prisma, account);
    if (!readiness.ready)
      throw new BadRequestException({
        message: 'Warm-up account is not ready to invite',
        blockers: readiness.blockers,
      });
    await this.prisma.warmupAccount.update({
      where: {
        id: account.id,
        organizationId: account.organizationId,
        isDeleted: false,
      },
      data: {
        diagnostics: {
          ...(account.diagnostics as Prisma.JsonObject),
          preparation: {
            ...(account.diagnostics as unknown as IWarmupAccountDiagnostics)
              .preparation,
            invitationReadiness: readiness,
          },
        } as unknown as Prisma.InputJsonValue,
        auditEvents: this.appendAuditEvent(
          account,
          actorUserId,
          'Verified readiness before explicit invitation dispatch.',
        ) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async getAccount(id: string): Promise<WarmupAccount> {
    return findOrThrow(
      this.prisma.warmupAccount,
      { where: { id, isDeleted: false } },
      'Warm-up account',
    );
  }

  private assertOrganizationId(account: WarmupAccount): string {
    if (!account.organizationId) {
      throw new BadRequestException('Warm-up organization is missing');
    }

    return account.organizationId;
  }

  private async loadInvitation(
    account: WarmupAccount,
  ): Promise<InvitationView | undefined> {
    if (!account.invitationId || !account.organizationId) {
      return undefined;
    }

    try {
      return await this.invitationService.getInvitation(
        account.invitationId,
        account.organizationId,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return undefined;
      }

      throw error;
    }
  }

  private async requireInvitation(
    account: WarmupAccount,
  ): Promise<InvitationView> {
    const invitation = await this.loadInvitation(account);

    if (!invitation) {
      throw new BadRequestException('Warm-up invitation is missing');
    }

    return invitation;
  }

  private async dispatchNewInvitation(
    account: WarmupAccount,
    actorUserId: string,
  ): Promise<InvitationView> {
    const organizationId = this.assertOrganizationId(account);

    const invitation = await this.invitationService.createInvitation({
      defaultRoleKey: 'member',
      email: account.leadEmail,
      firstName: account.leadFirstName ?? undefined,
      invitedByUserId: actorUserId,
      lastName: account.leadLastName ?? undefined,
      organizationId,
      redirectUrl: `/login?warmupAccountId=${account.id}`,
      sendEmail: false,
    });
    await this.persistInvitationTransition(account, {
      actorUserId,
      invitationId: invitation.id,
      auditMessage: 'Linked the claim invitation before email delivery.',
      diagnosticMessage: 'Invitation created; delivery pending.',
      diagnosticStatus: 'done',
    });
    return this.invitationService.resendInvitation({
      invitationId: invitation.id,
      invitedByUserId: actorUserId,
      organizationId,
    });
  }

  private async recordDispatchResult(
    account: WarmupAccount,
    actorUserId: string,
    invitation: InvitationView,
    action: 'resend' | 'send',
  ): Promise<WarmupAccountView> {
    const isFailed = invitation.status === 'delivery-failed';

    if (isFailed) {
      this.logger.error('Warm-up invitation dispatch failed', {
        ...this.context,
        action,
        invitationId: invitation.id,
        warmupAccountId: account.id,
      });
    }

    const updated = await this.persistInvitationTransition(account, {
      actorUserId,
      auditMessage: isFailed
        ? `Invitation ${invitation.id} ${action} failed.`
        : `Dispatched invitation ${invitation.id} via ${action}.`,
      diagnosticMessage: isFailed
        ? 'Invitation email dispatch failed. The invitation remains retryable.'
        : `Invitation email ${action === 'send' ? 'sent' : 'resent'}.`,
      diagnosticStatus: isFailed ? 'failed' : 'done',
      error: isFailed
        ? new Error(
            'Invitation email could not be delivered. Retry send when email delivery is available.',
          )
        : undefined,
      invitationId: invitation.id,
      status: WarmupAccountStatus.INVITED,
    });

    return this.toView(updated, invitation);
  }

  private async persistInvitationTransition(
    account: WarmupAccount,
    input: {
      actorUserId: string;
      auditMessage: string;
      diagnosticMessage: string;
      diagnosticStatus: IWarmupAccountDiagnosticStep['status'];
      error?: unknown;
      invitationId?: string;
      status?: WarmupAccountStatus;
    },
  ): Promise<WarmupAccount> {
    const organizationId = this.assertOrganizationId(account);

    const current = await this.getAccount(account.id);
    assertWarmupMutable(current);
    return this.prisma.warmupAccount.update({
      data: {
        auditEvents: this.appendAuditEvent(
          current,
          input.actorUserId,
          input.auditMessage,
        ) as unknown as Prisma.InputJsonValue,
        diagnostics: this.appendDiagnosticStep(
          current,
          input.diagnosticStatus,
          input.diagnosticMessage,
          input.error,
        ) as unknown as Prisma.InputJsonValue,
        ...(input.invitationId ? { invitationId: input.invitationId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      where: scopedWhere(organizationId, { id: account.id }),
    });
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
      where: scopedWhere(input.organizationId, {
        userId: input.operatorUserId,
      }),
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

  private toView(
    account: WarmupAccount,
    invitation?: InvitationView,
  ): WarmupAccountView {
    return {
      auditEvents: account.auditEvents as unknown as IWarmupAccountAuditEvent[],
      brandId: account.brandId ?? undefined,
      brandName: account.brandName,
      createdAt: account.createdAt.toISOString(),
      customerUserId: account.customerUserId ?? undefined,
      diagnostics: account.diagnostics as unknown as IWarmupAccountDiagnostics,
      guidance: account.guidance ?? undefined,
      id: account.id,
      invitation: invitation ? toSafeInvitation(invitation) : undefined,
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
