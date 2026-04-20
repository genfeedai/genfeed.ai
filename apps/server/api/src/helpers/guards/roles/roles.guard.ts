import { MembersService } from '@api/collections/members/services/members.service';
import { RoleEntity } from '@api/collections/roles/entities/role.entity';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/clerk/clerk.util';
import { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
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

    const publicMetadata: IClerkPublicMetadata = getPublicMetadata(user);

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

    // Extract organization ID from request (params, body, or publicMetadata)
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

    if (!/^[0-9a-f]{24}$/i.test(publicMetadata.user)) {
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
   * Priority: explicit organizationId param > request body > publicMetadata
   *
   * IMPORTANT: Only looks for :organizationId param specifically.
   * Generic :id params (brandId, postId, etc.) should NOT be treated as org IDs.
   */
  private extractOrganizationId(
    req: Request,
    publicMetadata: IClerkPublicMetadata,
  ): string | null {
    // 1. Check explicit org params (e.g., /organizations/:organizationId/...)
    const params = req.params as unknown as Record<string, string | undefined>;
    const explicitOrganizationId = params.organizationId ?? params.orgId;

    if (explicitOrganizationId !== undefined) {
      return /^[0-9a-f]{24}$/i.test(explicitOrganizationId)
        ? explicitOrganizationId
        : null;
    }

    // 2. Try to get from request body
    const bodyOrganization = req.body?.organization;
    if (bodyOrganization && /^[0-9a-f]{24}$/i.test(bodyOrganization)) {
      return bodyOrganization;
    }

    // 3. Fallback to publicMetadata (user's current org context)
    const metadataOrganization = publicMetadata.organization;
    if (metadataOrganization && /^[0-9a-f]{24}$/i.test(metadataOrganization)) {
      return metadataOrganization;
    }

    return null;
  }
}
