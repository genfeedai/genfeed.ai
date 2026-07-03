import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@api/config/config.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
} from '@genfeedai/helpers';
import type { Invitation, Member, Prisma, User } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
} from '@nestjs/common';

const INVITATION_TOKEN_BYTES = 32;
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_APP_URL = 'https://app.genfeed.ai';
const DEFAULT_API_PORT = '3010';

type InvitationStatus = 'accepted' | 'expired' | 'pending' | 'revoked';

export interface CreateInvitationInput {
  email: string;
  organizationId: string;
  invitedByUserId: string;
  roleId?: string;
  defaultRoleKey?: 'member' | 'user';
  firstName?: string;
  lastName?: string;
  redirectUrl?: string;
  expiresAt?: Date;
  sendEmail?: boolean;
}

export interface InvitationView {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  organizationId: string;
  invitedByUserId: string;
  roleId: string;
  status: InvitationStatus;
  redirectUrl?: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AcceptInvitationResult {
  invitation: InvitationView;
  memberId: string;
  organizationId: string;
  redirectUrl: string;
  userId: string;
}

type InvitationWithOrganization = Invitation & {
  organization?: { label: string } | null;
};

type InvitationTransaction = Prisma.TransactionClient;
type RoleAssignment = { roleId: string; roleKey: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
}

function generateHandle(email: string): string {
  const base =
    email
      .split('@')[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'user';

  return `${base}-${randomUUID().slice(0, 8)}`;
}

function getInvitationStatus(
  invitation: Pick<Invitation, 'acceptedAt' | 'expiresAt' | 'revokedAt'>,
  now = new Date(),
): InvitationStatus {
  if (invitation.acceptedAt) {
    return 'accepted';
  }
  if (invitation.revokedAt) {
    return 'revoked';
  }
  if (invitation.expiresAt <= now) {
    return 'expired';
  }
  return 'pending';
}

function toInvitationView(invitation: Invitation): InvitationView {
  return {
    acceptedAt: invitation.acceptedAt,
    createdAt: invitation.createdAt,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    firstName: invitation.firstName ?? undefined,
    id: invitation.id,
    invitedByUserId: invitation.invitedByUserId,
    lastName: invitation.lastName ?? undefined,
    organizationId: invitation.organizationId,
    redirectUrl: invitation.redirectUrl ?? undefined,
    revokedAt: invitation.revokedAt,
    roleId: invitation.roleId,
    status: getInvitationStatus(invitation),
    updatedAt: invitation.updatedAt,
  };
}

@Injectable()
export class InvitationService {
  private readonly context = { service: InvitationService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly logger: LoggerService,
  ) {}

  async createInvitation(
    input: CreateInvitationInput,
  ): Promise<InvitationView> {
    const email = normalizeEmail(input.email);
    const role = await this.resolveRoleAssignment(
      input.roleId,
      input.defaultRoleKey ?? 'member',
    );

    const organization = await this.prisma.organization.findFirst({
      select: { id: true, label: true },
      where: { id: input.organizationId, isDeleted: false },
    });

    if (!organization) {
      throw new NotFoundException('Organization');
    }

    await this.assertNoActiveMember(email, input.organizationId);

    const token = generateInvitationToken();
    const tokenHash = hashToken(token);
    const expiresAt =
      input.expiresAt ?? new Date(Date.now() + INVITATION_EXPIRY_MS);

    const invitation = await this.prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        data: { isDeleted: true, revokedAt: new Date(), status: 'canceled' },
        where: {
          acceptedAt: null,
          email,
          isDeleted: false,
          organizationId: input.organizationId,
          revokedAt: null,
        },
      });

      return tx.invitation.create({
        data: {
          email,
          expiresAt,
          firstName: input.firstName,
          invitedByUserId: input.invitedByUserId,
          lastName: input.lastName,
          organizationId: input.organizationId,
          redirectUrl: input.redirectUrl,
          roleId: role.roleId,
          roleKey: role.roleKey,
          status: 'pending',
          tokenHash,
        },
      });
    });

    if (input.sendEmail !== false) {
      await this.sendInvitationEmail({
        invitation: { ...invitation, organization },
        token,
      });
    }

    return toInvitationView(invitation);
  }

  async listPendingInvitations(
    organizationId: string,
  ): Promise<InvitationView[]> {
    const invitations = await this.prisma.invitation.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        acceptedAt: null,
        expiresAt: { gt: new Date() },
        isDeleted: false,
        organizationId,
        revokedAt: null,
      },
    });

    return invitations.map(toInvitationView);
  }

  async revokeInvitation(
    invitationId: string,
    organizationId: string,
  ): Promise<InvitationView> {
    const invitation = await this.getInvitationForOrganization(
      invitationId,
      organizationId,
    );

    if (invitation.acceptedAt) {
      throw new ConflictException('Invitation has already been accepted');
    }
    if (invitation.revokedAt || invitation.isDeleted) {
      throw new GoneException('Invitation has already been revoked');
    }

    const revoked = await this.prisma.invitation.update({
      data: { isDeleted: true, revokedAt: new Date(), status: 'canceled' },
      where: { id: invitation.id },
    });

    return toInvitationView(revoked);
  }

  async resendInvitation(input: {
    invitationId: string;
    organizationId: string;
    invitedByUserId: string;
  }): Promise<InvitationView> {
    const invitation = await this.getInvitationForOrganization(
      input.invitationId,
      input.organizationId,
    );

    if (invitation.acceptedAt) {
      throw new ConflictException('Invitation has already been accepted');
    }

    if (invitation.revokedAt || invitation.isDeleted) {
      throw new GoneException('Invitation has already been revoked');
    }

    await this.revokeInvitation(input.invitationId, input.organizationId);

    return this.createInvitation({
      defaultRoleKey: 'member',
      email: invitation.email,
      firstName: invitation.firstName ?? undefined,
      invitedByUserId: input.invitedByUserId,
      lastName: invitation.lastName ?? undefined,
      organizationId: input.organizationId,
      redirectUrl: invitation.redirectUrl ?? undefined,
      roleId: invitation.roleId,
    });
  }

  async acceptInvitation(token: string): Promise<AcceptInvitationResult> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new BadRequestException('Invitation token is required');
    }
    const tokenHash = hashToken(normalizedToken);

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        include: { organization: { select: { label: true } } },
        where: { tokenHash },
      });

      if (!invitation || invitation.isDeleted) {
        throw new NotFoundException('Invitation');
      }

      this.assertInvitationAcceptable(invitation);

      const consumeResult = await tx.invitation.updateMany({
        data: { acceptedAt: new Date(), status: 'accepted' },
        where: {
          acceptedAt: null,
          id: invitation.id,
          isDeleted: false,
          revokedAt: null,
        },
      });

      if (consumeResult.count !== 1) {
        throw new GoneException('Invitation is no longer available');
      }

      const user = await this.findOrCreateAcceptedUser(tx, invitation);
      const member = await this.findOrCreateAcceptedMember(
        tx,
        invitation,
        user.id,
      );

      const acceptedInvitation = await tx.invitation.update({
        data: { acceptedByUserId: user.id },
        where: { id: invitation.id },
      });

      return {
        invitation: toInvitationView(acceptedInvitation),
        memberId: member.id,
        organizationId: invitation.organizationId,
        redirectUrl: this.resolveRedirectUrl(invitation),
        userId: user.id,
      };
    });
  }

  buildAcceptUrl(token: string): string {
    const url = new URL('/accept-invitation', this.getApiBaseUrl());
    url.searchParams.set('token', token);
    return url.toString();
  }

  resolveFallbackRedirectUrl(organizationId: string): string {
    const url = new URL('/login', this.getAppBaseUrl());
    url.searchParams.set('invitation', 'accepted');
    url.searchParams.set('org', organizationId);
    return url.toString();
  }

  private async resolveRoleAssignment(
    roleId: string | undefined,
    defaultRoleKey: 'member' | 'user',
  ): Promise<RoleAssignment> {
    if (roleId) {
      const role = await this.prisma.role.findFirst({
        select: { id: true, key: true },
        where: { id: roleId, isDeleted: false },
      });
      if (!role) {
        throw new BadRequestException('Role not found');
      }
      return { roleId: role.id, roleKey: role.key };
    }

    const role =
      (await this.prisma.role.findFirst({
        select: { id: true, key: true },
        where: { isDeleted: false, key: defaultRoleKey },
      })) ??
      (await this.prisma.role.findFirst({
        select: { id: true, key: true },
        where: { isDeleted: false, key: 'user' },
      }));

    if (!role) {
      throw new BadRequestException('Default role not found');
    }

    return { roleId: role.id, roleKey: role.key };
  }

  private async assertNoActiveMember(
    email: string,
    organizationId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      select: { id: true },
      where: { email, isDeleted: false },
    });

    if (!user) {
      return;
    }

    const member = await this.prisma.member.findFirst({
      select: { id: true },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId,
        userId: user.id,
      },
    });

    if (member) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }
  }

  private async getInvitationForOrganization(
    invitationId: string,
    organizationId: string,
  ): Promise<Invitation> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, isDeleted: false },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation');
    }

    if (invitation.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Invitation does not belong to this organization',
      );
    }

    return invitation;
  }

  private assertInvitationAcceptable(invitation: Invitation): void {
    if (invitation.acceptedAt) {
      throw new GoneException('Invitation has already been accepted');
    }
    if (invitation.revokedAt) {
      throw new GoneException('Invitation has been revoked');
    }
    if (invitation.expiresAt <= new Date()) {
      throw new GoneException('Invitation has expired');
    }
  }

  private async findOrCreateAcceptedUser(
    tx: InvitationTransaction,
    invitation: Invitation,
  ): Promise<User> {
    const existing = await tx.user.findFirst({
      where: { email: invitation.email, isDeleted: false },
    });

    if (existing) {
      return tx.user.update({
        data: {
          emailVerified: true,
          isInvited: false,
          lastUsedOrganizationId: invitation.organizationId,
        },
        where: { id: existing.id },
      });
    }

    const name = [invitation.firstName, invitation.lastName]
      .filter(Boolean)
      .join(' ');

    const user = await tx.user.create({
      data: {
        email: invitation.email,
        emailVerified: true,
        firstName: invitation.firstName,
        handle: generateHandle(invitation.email),
        isInvited: false,
        lastName: invitation.lastName,
        lastUsedOrganizationId: invitation.organizationId,
        name: name || null,
      },
    });

    await tx.setting.create({ data: { userId: user.id } });

    return user;
  }

  private async findOrCreateAcceptedMember(
    tx: InvitationTransaction,
    invitation: Invitation,
    userId: string,
  ): Promise<Member> {
    const existing = await tx.member.findFirst({
      where: {
        isDeleted: false,
        organizationId: invitation.organizationId,
        userId,
      },
    });

    if (existing) {
      if (existing.isActive) {
        return existing;
      }

      return tx.member.update({
        data: {
          isActive: true,
          roleId: invitation.roleId,
          roleKey: invitation.roleKey,
        },
        where: { id: existing.id },
      });
    }

    return tx.member.create({
      data: {
        isActive: true,
        organizationId: invitation.organizationId,
        roleId: invitation.roleId,
        roleKey: invitation.roleKey,
        userId,
      },
    });
  }

  private async sendInvitationEmail(input: {
    invitation: InvitationWithOrganization;
    token: string;
  }): Promise<void> {
    const acceptUrl = this.buildAcceptUrl(input.token);
    const organizationLabel =
      input.invitation.organization?.label ?? 'a Genfeed.ai organization';
    const subject = `You're invited to ${organizationLabel}`;
    const html = this.buildInvitationHtml({
      acceptUrl,
      email: input.invitation.email,
      organizationLabel,
    });

    await this.notificationsService.sendEmail(
      input.invitation.email,
      subject,
      html,
    );

    this.logger.log('Invitation email dispatched', {
      ...this.context,
      emailDomain: input.invitation.email.split('@')[1] ?? 'unknown',
      invitationId: input.invitation.id,
      organizationId: input.invitation.organizationId,
    });
  }

  private buildInvitationHtml(input: {
    acceptUrl: string;
    email: string;
    organizationLabel: string;
  }): string {
    return buildSystemEmailHtml({
      action: { label: 'Accept invitation', url: input.acceptUrl },
      bodyHtml: buildSystemEmailParagraph(
        `An invitation was sent to ${input.email}. Accept it to join ${input.organizationLabel}. This link expires in 7 days and can only be used once.`,
      ),
      footerNote:
        'If you did not expect this invitation, you can safely ignore this email.',
      preheader: `Join ${input.organizationLabel} on Genfeed.ai.`,
      title: `Join ${input.organizationLabel} on Genfeed.ai`,
    });
  }

  private resolveRedirectUrl(invitation: Invitation): string {
    return (
      invitation.redirectUrl ??
      this.resolveFallbackRedirectUrl(invitation.organizationId)
    );
  }

  private getApiBaseUrl(): string {
    const configured =
      this.configService.get('GENFEEDAI_API_URL') ??
      this.configService.get('BETTER_AUTH_URL');

    if (typeof configured === 'string' && configured.length > 0) {
      return configured.replace(/\/$/, '');
    }

    const port = this.configService.get('PORT') ?? DEFAULT_API_PORT;
    return `http://localhost:${port}`;
  }

  private getAppBaseUrl(): string {
    const configured = this.configService.get('GENFEEDAI_APP_URL');

    if (typeof configured === 'string' && configured.length > 0) {
      return configured.replace(/\/$/, '');
    }

    return DEFAULT_APP_URL;
  }
}
