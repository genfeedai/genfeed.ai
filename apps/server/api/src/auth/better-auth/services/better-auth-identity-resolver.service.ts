import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UserSetupService } from '@api/collections/users/services/user-setup.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { IBetterAuthResolvedIdentity } from '../better-auth.types';
import { isPlatformSuperAdmin } from '../better-auth-access.util';

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
  return getRecordId(record, 'id');
}

function getMemberOrganizationId(member: MemberDocument): string {
  return member.organizationId;
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
    private readonly identityCache: BetterAuthIdentityCacheService,
    private readonly userSetupService: UserSetupService,
  ) {}

  async resolve(userId: string): Promise<IBetterAuthResolvedIdentity> {
    const cached = await this.identityCache.get(userId);
    if (cached) {
      return cached;
    }

    const identity = await this.resolveFromDatabase(userId);
    await this.identityCache.set(userId, identity);
    return identity;
  }

  private async resolveFromDatabase(
    userId: string,
  ): Promise<IBetterAuthResolvedIdentity> {
    const user = await this.usersService.findOne(
      { id: userId, isDeleted: false },
      [],
    );
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

    const members =
      await this.membersService.findActiveForUserAccess(resolvedUserId);

    const organizationId = await this.resolveOrganizationId(
      members,
      lastUsedOrganizationId,
    );

    if (!organizationId && members.length === 0) {
      const provisioned = await this.provisionMissingWorkspace(
        resolvedUserId,
        userRecord,
      );
      if (provisioned) {
        await this.persistActiveOrganizationIfStale(
          resolvedUserId,
          provisioned.organizationId,
          lastUsedOrganizationId,
        );
        return {
          brandId: provisioned.brandId,
          isSuperAdmin,
          organizationId: provisioned.organizationId,
          userId: resolvedUserId,
        };
      }
    }

    // A user with active membership rows must resolve to SOME organization.
    // Silently returning `organizationId: undefined` here let every
    // downstream organization-scoped OR branch
    // (images/videos/gifs/agent-* controllers) collapse to `{}` and get
    // dropped by BaseService.normalizeWhere's empty-entry filter — silently
    // narrowing list queries to self-created records only (200 OK, 0 results)
    // instead of surfacing the real problem: an orphaned/inaccessible
    // organization for a live membership row.
    if (!organizationId && members.length > 0) {
      throw new UnauthorizedException(
        'Unable to resolve an accessible organization for this account',
      );
    }

    const brandId = organizationId
      ? await this.resolveBrandId(organizationId, members)
      : undefined;

    await this.persistActiveOrganizationIfStale(
      resolvedUserId,
      organizationId,
      lastUsedOrganizationId,
    );

    return {
      brandId,
      isSuperAdmin,
      organizationId,
      userId: resolvedUserId,
    };
  }

  private async resolveOrganizationId(
    members: MemberDocument[],
    lastUsedOrganizationId?: string,
  ): Promise<string | undefined> {
    const memberOrganizationIds = [
      ...new Set(
        members
          .map(getMemberOrganizationId)
          .filter((organizationId) => organizationId.length > 0),
      ),
    ];
    if (memberOrganizationIds.length === 0) {
      return undefined;
    }

    const organizations = await this.organizationsService.findAll(
      {
        select: { id: true },
        where: {
          id: { in: memberOrganizationIds },
          isDeleted: false,
        },
      },
      { pagination: false },
      false,
    );
    const accessibleOrganizationIds = new Set(
      organizations.docs
        .map((organization) =>
          getEntityId(organization as unknown as Record<string, unknown>),
        )
        .filter((organizationId) => organizationId.length > 0),
    );

    if (
      lastUsedOrganizationId &&
      accessibleOrganizationIds.has(lastUsedOrganizationId)
    ) {
      return lastUsedOrganizationId;
    }

    return memberOrganizationIds.find((organizationId) =>
      accessibleOrganizationIds.has(organizationId),
    );
  }

  private async persistActiveOrganizationIfStale(
    userId: string,
    organizationId: string | undefined,
    lastUsedOrganizationId?: string,
  ): Promise<void> {
    if (!organizationId || organizationId === lastUsedOrganizationId) {
      return;
    }

    try {
      await this.usersService.patch(userId, {
        lastUsedOrganizationId: organizationId,
      });
    } catch {
      // Auth must still succeed; the next request re-resolves from memberships.
    }
  }

  private async resolveBrandId(
    organizationId: string,
    members: MemberDocument[],
  ): Promise<string | undefined> {
    const memberForOrg = members.find(
      (member) => getMemberOrganizationId(member) === organizationId,
    );
    const lastUsedBrandId = getRecordId(
      memberForOrg as unknown as Record<string, unknown> | undefined,
      'lastUsedBrandId',
    );

    if (lastUsedBrandId) {
      const lastUsedBrand = await this.brandsService.findOne({
        id: lastUsedBrandId,
        isDeleted: false,
        organizationId: organizationId,
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
      organizationId: organizationId,
    });
    return (
      getEntityId(firstBrand as Record<string, unknown> | null | undefined) ||
      undefined
    );
  }

  /**
   * Signup can persist a session even when UserSetupService throws. The next
   * authenticated request must finish provisioning so /agent/onboarding sits
   * on a real membership org instead of spinning with no access state.
   */
  private async provisionMissingWorkspace(
    userId: string,
    userRecord: Record<string, unknown> | null | undefined,
  ): Promise<{ brandId?: string; organizationId: string } | null> {
    try {
      const setup = await this.userSetupService.initializeUserResources(
        userId,
        undefined,
        {
          email: getRecordId(userRecord, 'email') || null,
          name: getRecordId(userRecord, 'name') || null,
        },
      );
      const organizationId = getEntityId(
        setup.organization as unknown as Record<string, unknown>,
      );
      if (!organizationId) {
        return null;
      }

      return {
        brandId:
          getEntityId(setup.brand as unknown as Record<string, unknown>) ||
          undefined,
        organizationId,
      };
    } catch {
      return null;
    }
  }
}
