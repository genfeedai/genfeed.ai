import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { PlatformRole } from '@genfeedai/enums';
import { Injectable, UnauthorizedException } from '@nestjs/common';

import type { IBetterAuthResolvedIdentity } from '../better-auth.types';

function getRecordId(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = record?.[key];
  return typeof value === 'string' ? value : '';
}

function getEntityId(
  record: Record<string, unknown> | null | undefined,
): string {
  return getRecordId(record, 'id') || getRecordId(record, '_id');
}

function getMemberOrganizationId(member: MemberDocument): string {
  const record = member as unknown as Record<string, unknown>;
  return (
    getRecordId(record, 'organizationId') || getRecordId(record, 'organization')
  );
}

function isPlatformSuperAdmin(platformRole: unknown): boolean {
  return (
    typeof platformRole === 'string' &&
    platformRole.toUpperCase() === PlatformRole.SUPERADMIN
  );
}

/**
 * Resolves the genfeed identity (org + brand + super-admin) for a Better Auth
 * principal (epic #735, Phase 1 — #736).
 *
 * The JWT `sub` is the genfeed `User.id` (Better Auth's user maps onto the
 * existing `User` table), so resolution reads the existing Organization/Member/
 * Brand tables — the same source the legacy auth provider path uses — without any legacy auth provider lookup,
 * reconciliation, or metadata write-back. Subscription tier/status are not
 * resolved here: `RequestContextMiddleware` derives those from the DB by
 * organization id.
 */
@Injectable()
export class BetterAuthIdentityResolverService {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly brandsService: BrandsService,
    private readonly membersService: MembersService,
  ) {}

  async resolve(userId: string): Promise<IBetterAuthResolvedIdentity> {
    const user = await this.usersService.findOne({ _id: userId }, []);
    const userRecord = user as Record<string, unknown> | null | undefined;
    const resolvedUserId = getEntityId(userRecord);

    if (!resolvedUserId) {
      throw new UnauthorizedException('User account not found');
    }

    const isSuperAdmin = isPlatformSuperAdmin(userRecord?.platformRole);
    const lastUsedOrganizationId = getRecordId(
      userRecord,
      'lastUsedOrganizationId',
    );

    const members = await this.membersService.find({
      isActive: true,
      isDeleted: false,
      user: resolvedUserId,
    });

    const organizationId = await this.resolveOrganizationId(
      resolvedUserId,
      members,
      lastUsedOrganizationId,
    );
    const brandId = organizationId
      ? await this.resolveBrandId(organizationId, members)
      : undefined;

    return {
      brandId,
      isSuperAdmin,
      organizationId,
      userId: resolvedUserId,
    };
  }

  private async findAccessibleOrganizationId(
    candidate: string,
    userId: string,
    members: MemberDocument[],
  ): Promise<string | undefined> {
    const organization = await this.organizationsService.findOne({
      _id: candidate,
      isDeleted: false,
    });
    const organizationId = getEntityId(
      organization as Record<string, unknown> | null | undefined,
    );
    if (!organizationId) {
      return undefined;
    }

    const isMember = members.some(
      (member) => getMemberOrganizationId(member) === organizationId,
    );
    const isOwner =
      getRecordId(organization as Record<string, unknown>, 'userId') ===
        userId ||
      getRecordId(organization as Record<string, unknown>, 'user') === userId;

    return isMember || isOwner ? organizationId : undefined;
  }

  private async resolveOrganizationId(
    userId: string,
    members: MemberDocument[],
    lastUsedOrganizationId?: string,
  ): Promise<string | undefined> {
    // DB-authoritative active org (epic #735, Phase C): prefer the user's
    // `lastUsedOrganizationId` (validated against live membership/ownership) so
    // multi-org switching is honoured without any legacy auth provider publicMetadata.
    if (lastUsedOrganizationId) {
      const accessibleOrgId = await this.findAccessibleOrganizationId(
        lastUsedOrganizationId,
        userId,
        members,
      );
      if (accessibleOrgId) {
        return accessibleOrgId;
      }
    }

    const ownerOrg = await this.organizationsService.findOne({
      isDeleted: false,
      user: userId,
    });
    const ownerOrgId = getEntityId(
      ownerOrg as Record<string, unknown> | null | undefined,
    );
    if (ownerOrgId) {
      return ownerOrgId;
    }

    for (const member of members) {
      const memberOrgId = getMemberOrganizationId(member);
      if (!memberOrgId) {
        continue;
      }
      const organization = await this.organizationsService.findOne({
        _id: memberOrgId,
        isDeleted: false,
      });
      const organizationId = getEntityId(
        organization as Record<string, unknown> | null | undefined,
      );
      if (organizationId) {
        return organizationId;
      }
    }

    return undefined;
  }

  private async resolveBrandId(
    organizationId: string,
    members: MemberDocument[],
  ): Promise<string | undefined> {
    const memberForOrg = members.find(
      (member) => getMemberOrganizationId(member) === organizationId,
    );
    const lastUsedBrandId =
      getRecordId(
        memberForOrg as unknown as Record<string, unknown> | undefined,
        'lastUsedBrandId',
      ) ||
      getRecordId(
        memberForOrg as unknown as Record<string, unknown> | undefined,
        'lastUsedBrand',
      );

    if (lastUsedBrandId) {
      const lastUsedBrand = await this.brandsService.findOne({
        _id: lastUsedBrandId,
        isDeleted: false,
        organization: organizationId,
      });
      const brandId = getEntityId(
        lastUsedBrand as Record<string, unknown> | null | undefined,
      );
      if (brandId) {
        return brandId;
      }
    }

    const firstBrand = await this.brandsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });
    return (
      getEntityId(firstBrand as Record<string, unknown> | null | undefined) ||
      undefined
    );
  }
}
