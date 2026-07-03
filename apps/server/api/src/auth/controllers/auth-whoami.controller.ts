import { MembersService } from '@api/collections/members/services/members.service';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Req } from '@nestjs/common';

type AuthWhoamiUser = {
  email?: string;
  emailAddresses?: Array<{
    emailAddress?: string;
  }>;
  firstName?: string;
  id?: string;
  lastName?: string;
  publicMetadata?: Record<string, unknown>;
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
    const meta = user?.publicMetadata || {};
    const context = req.context;
    const contextUserId = context?.userId ?? meta.user;
    const contextOrganizationId = context?.organizationId ?? meta.organization;
    const mongoUserId = EntityIdUtil.isValid(contextUserId)
      ? String(contextUserId)
      : '';
    const authUserId = user?.id || '';

    const role = await this.resolveOrganizationRole({
      organization: contextOrganizationId,
      user: contextUserId,
    });

    return {
      data: {
        isApiKey: meta.isApiKey || false,
        organization: {
          id: meta.organization || '',
          name: meta.organizationName || '',
        },
        role,
        scopes: meta.scopes || ['*'],
        user: {
          authUserId,
          email: user?.emailAddresses?.[0]?.emailAddress || user?.email || '',
          id: mongoUserId,
          name: user?.firstName
            ? `${user.firstName} ${user.lastName || ''}`.trim()
            : '',
        },
      },
    };
  }

  /**
   * Resolve the caller's organization role key (a `MemberRole` value: owner |
   * admin | creator | analytics | user | support) from their active membership.
   * Returns `''` when membership/role can't be resolved so downstream role
   * gating (e.g. the MCP server's tool guard) denies by default rather than
   * silently elevating. Never throws — identity introspection must not 500 on a
   * membership-lookup hiccup.
   */
  private async resolveOrganizationRole(
    meta: Record<string, unknown>,
  ): Promise<string> {
    const userId = meta.user;
    const organizationId = meta.organization;

    if (!userId || !organizationId) {
      return '';
    }

    try {
      const member = await this.membersService.findOne(
        {
          isActive: true,
          isDeleted: false,
          organization: String(organizationId),
          user: String(userId),
        },
        [PopulateBuilder.withFields('role', ['_id', 'key', 'label'])],
      );

      const role = member?.role as unknown as { key?: string } | undefined;
      return role?.key ?? '';
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
