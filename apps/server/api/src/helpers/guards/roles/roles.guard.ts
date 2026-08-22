import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { RoleEntity } from '@api/collections/roles/entities/role.entity';
import {
  ROLES_KEY,
  SKIP_ROLES_KEY,
} from '@api/helpers/decorators/roles/roles.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import { MemberRole } from '@genfeedai/enums';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membersService: MembersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<(string | MemberRole)[]>(
      ROLES_KEY,
      context.getHandler(),
    );
    const skipRoles =
      this.reflector.get<boolean>(SKIP_ROLES_KEY, context.getHandler()) ===
      true;

    const req = context.switchToHttp().getRequest<Request & { user?: User }>();
    const user = req.user;

    if (!user) {
      throw new HttpException(
        {
          detail: 'Token is incorrect',
          title: 'Roles - Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Authenticated discovery/catalog handlers can opt out when they must run
    // before an active organization is known. Those handlers own their data
    // scoping and still pass through the authentication check above.
    if (skipRoles) {
      return true;
    }

    // SUPERADMIN BYPASS: Platform-level superadmin has access to everything
    if (getIsSuperAdmin(user, req)) {
      return true;
    }

    // Check if ONLY superadmin is allowed (no org-level access)
    const isSuperAdminOnly =
      requiredRoles &&
      requiredRoles.length === 1 &&
      requiredRoles.includes('superadmin');

    if (isSuperAdminOnly && !getIsSuperAdmin(user, req)) {
      throw new HttpException(
        {
          detail: 'Only platform superadmins can access this resource',
          title: 'Roles - Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Get organization-level roles (filter out 'superadmin' string)
    const orgLevelRoles = requiredRoles
      ? requiredRoles.filter(
          (role): role is MemberRole => role !== 'superadmin',
        )
      : [];

    // Extract organization ID from the authenticated session first.
    const organizationId = this.extractOrganizationId(req, user);

    if (!organizationId) {
      // If no org context and no roles required, allow (e.g., platform-level endpoints)
      if (!requiredRoles || requiredRoles.length === 0) {
        return true;
      }

      throw new HttpException(
        {
          detail: 'Organization context is required',
          title: 'Roles - Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (!isEntityId(user.userId ?? user.id)) {
      throw new HttpException(
        {
          detail: 'User context is invalid',
          title: 'Roles - Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // MEMBERSHIP CHECK: Verify user is an active member of the organization
    const member = await this.membersService.findOne(
      {
        isActive: true,
        organizationId: organizationId,
        userId: user.userId ?? user.id,
      },
      [PopulateBuilder.withFields('role', ['id', 'key', 'label'])],
    );

    if (!member) {
      throw new HttpException(
        {
          detail: `User is not a member of organization ${organizationId}`,
          title: 'Roles - Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // If no specific org-level roles required, membership check is sufficient
    // This allows endpoints accessible to "any member" without listing all roles
    if (orgLevelRoles.length === 0) {
      return true;
    }

    // ROLE CHECK: Verify user has one of the required organization-level roles
    // Role is populated, so check if it has the expected structure
    const role = (member as typeof member & { role?: RoleEntity }).role;
    const memberRole = role?.key as MemberRole | undefined;

    if (!memberRole) {
      throw new HttpException(
        {
          detail: 'Member role not found',
          title: 'Roles - Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const hasRequiredRole = orgLevelRoles.includes(memberRole);

    if (!hasRequiredRole) {
      throw new HttpException(
        {
          detail: `Required roles: ${orgLevelRoles.join(', ')}. Your role: ${memberRole}`,
          title: 'Roles - Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }

  /**
   * Extract organization ID from request context
   * Priority: user > consistent explicit organizationId param/body
   *
   * IMPORTANT: Only looks for :organizationId param specifically.
   * Generic :id params (brandId, postId, etc.) should NOT be treated as org IDs.
   *
   * Explicit values that conflict with the session's organization are rejected
   * (403), not silently overridden; multi-org users must switch their active
   * organization first.
   */
  private extractOrganizationId(
    req: Request,
    user: AuthenticatedUser,
  ): string | null {
    const metadataOrganization = this.normalizeOrganizationId(
      user.organizationId,
    );
    const explicitOrganizationValues =
      this.extractExplicitOrganizationValues(req);

    if (metadataOrganization) {
      this.assertExplicitOrganizationMatchesContext(
        explicitOrganizationValues,
        metadataOrganization,
      );
      return metadataOrganization;
    }

    return this.resolveFirstExplicitOrganizationId(explicitOrganizationValues);
  }

  private extractExplicitOrganizationValues(req: Request): unknown[] {
    const params = req.params as unknown as Record<string, unknown>;
    const body = req.body as Record<string, unknown> | undefined;

    return [
      params.organizationId,
      params.orgId,
      this.normalizeOrganizationId(body?.organization),
      body?.organizationId,
      body?.orgId,
    ].filter((value) => value !== undefined && value !== null && value !== '');
  }

  private resolveFirstExplicitOrganizationId(
    explicitOrganizationValues: unknown[],
  ): string | null {
    if (explicitOrganizationValues.length === 0) {
      return null;
    }

    return this.normalizeOrganizationId(explicitOrganizationValues[0]);
  }

  private assertExplicitOrganizationMatchesContext(
    explicitOrganizationValues: unknown[],
    metadataOrganization: string,
  ): void {
    for (const explicitOrganizationValue of explicitOrganizationValues) {
      if (
        this.normalizeOrganizationId(explicitOrganizationValue) !==
        metadataOrganization
      ) {
        throw new HttpException(
          {
            detail: 'Organization context does not match authenticated session',
            title: 'Roles - Forbidden',
          },
          HttpStatus.FORBIDDEN,
        );
      }
    }
  }

  private normalizeOrganizationId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const organizationId = value.trim();
    return isEntityId(organizationId) ? organizationId : null;
  }
}
