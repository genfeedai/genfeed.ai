import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { RoleEntity } from '@api/collections/roles/entities/role.entity';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { IAuthPublicMetadata } from '@api/shared/interfaces/auth/auth-public-metadata.interface';
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
      'roles',
      context.getHandler(),
    );

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

    const publicMetadata: IAuthPublicMetadata = getPublicMetadata(user);

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
    const organizationId = this.extractOrganizationId(req, publicMetadata);

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

    if (!isEntityId(publicMetadata.user)) {
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
        isDeleted: false,
        organization: organizationId,
        user: publicMetadata.user,
      },
      [PopulateBuilder.withFields('role', ['_id', 'key', 'label'])], // Populate role with key field
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
    const role = member?.role as unknown as RoleEntity;
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
   * Priority: publicMetadata > consistent explicit organizationId param/body
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
    publicMetadata: IAuthPublicMetadata,
  ): string | null {
    const metadataOrganization = this.normalizeOrganizationId(
      publicMetadata.organization,
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
