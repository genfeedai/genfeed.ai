import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { MembersService } from '@api/collections/members/services/members.service';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import { hasExplicitApiKeyAdminScope, MemberRole } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Req } from '@nestjs/common';

type AuthWhoamiUser = Partial<AuthenticatedUser> & {
  email?: string;
};

type AuthWhoamiRequest = {
  context?: IRequestContext;
  user?: AuthWhoamiUser;
};

/**
 * Auth controller for identity introspection.
 * Works with both Better Auth JWT and API key authentication.
 *
 * GET /auth/whoami — returns the authenticated user/org context.
 */
@Controller('auth')
export class AuthWhoamiController {
  constructor(
    private readonly membersService: MembersService,
    private readonly logger: LoggerService,
  ) {}

  @Get('whoami')
  async whoami(@Req() req: AuthWhoamiRequest) {
    const user = req.user;
    const context = req.context;
    const contextUserId = context?.userId ?? user?.userId ?? user?.id;
    const contextOrganizationId =
      context?.organizationId ?? user?.organizationId;
    const databaseUserId = EntityIdUtil.isValid(contextUserId)
      ? String(contextUserId)
      : '';
    const authUserId = user?.id || '';

    const isApiKey = user?.isApiKey === true;
    const scopes = Array.isArray(user?.scopes) ? user.scopes : [];
    const membershipRole = await this.resolveOrganizationRole({
      organizationId: contextOrganizationId,
      userId: contextUserId,
    });
    const role =
      isApiKey && !hasExplicitApiKeyAdminScope(scopes)
        ? this.withoutImplicitAdminRole(membershipRole)
        : membershipRole;

    return {
      data: {
        isApiKey,
        organization: {
          id: user?.organizationId || '',
          name: '',
        },
        role,
        scopes,
        user: {
          authUserId,
          email: user?.emailAddresses?.[0]?.emailAddress || user?.email || '',
          id: databaseUserId,
          name: user?.firstName
            ? `${user.firstName} ${user.lastName || ''}`.trim()
            : '',
        },
      },
    };
  }

  /**
   * API keys must not advertise the issuer's org-admin membership as their
   * own role. Strip owner/admin/superadmin so downstream MCP tool gating
   * cannot treat a content-scoped key as an admin credential.
   */
  private withoutImplicitAdminRole(role: string): string {
    if (
      role === MemberRole.OWNER ||
      role === MemberRole.ADMIN ||
      role === 'superadmin'
    ) {
      return '';
    }
    return role;
  }

  /**
   * Resolve the caller's organization role key (a `MemberRole` value: owner |
   * admin | creator | analytics | user | support) from their active membership.
   * Returns `''` when membership/role can't be resolved so downstream role
   * gating (e.g. the MCP server's tool guard) denies by default rather than
   * silently elevating. Never throws — identity introspection must not 500 on a
   * membership-lookup hiccup.
   */
  private async resolveOrganizationRole(identity: {
    organizationId?: string;
    userId?: string;
  }): Promise<string> {
    const userId = identity.userId;
    const organizationId = identity.organizationId;

    if (!userId || !organizationId) {
      return '';
    }

    try {
      const member = (await this.membersService.findOne(
        {
          isActive: true,
          organizationId: String(organizationId),
          userId: String(userId),
        },
        [PopulateBuilder.withFields('role', ['id', 'key', 'label'])],
      )) as (MemberDocument & { role?: { key?: string } | null }) | null;

      return member?.role?.key ?? '';
    } catch (error: unknown) {
      // Fail closed: an unresolved role denies admin-gated tools downstream.
      // Log so a persistent membership-lookup failure (e.g. DB outage) is
      // visible rather than silently stripping everyone's role.
      this.logger.warn(
        'whoami: failed to resolve organization role, defaulting to none',
        {
          error: (error as Error)?.message,
          organizationId: String(organizationId),
          userId: String(userId),
        },
      );
      return '';
    }
  }
}
