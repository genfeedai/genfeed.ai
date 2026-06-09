import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { MemberDocument } from '@api/collections/members/schemas/member.schema';
import { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';

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
  return getRecordId(record, '_id') || getRecordId(record, 'id');
}

function asMemberRecord(member: MemberDocument): Record<string, unknown> {
  return member as unknown as Record<string, unknown>;
}

/**
 * Extract the primary, verified email from a Clerk user. Returns '' when there
 * is no verified primary email. Matching on a *verified* address is what makes
 * email-based reconciliation safe: Clerk enforces email uniqueness per instance
 * and only the rightful owner can verify an address, so a verified email is a
 * trustworthy join key back to an existing local user row.
 */
function getPrimaryVerifiedEmail(user: User): string {
  const emails = user.emailAddresses ?? [];
  if (emails.length === 0) {
    return '';
  }

  const primary =
    (user.primaryEmailAddressId
      ? emails.find((email) => email.id === user.primaryEmailAddressId)
      : undefined) ?? emails[0];

  if (!primary || primary.verification?.status !== 'verified') {
    return '';
  }

  return (primary.emailAddress ?? '').trim().toLowerCase();
}

@Injectable()
export class AuthIdentityResolverService {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly brandsService: BrandsService,
    private readonly membersService: MembersService,
    private readonly clerkService: ClerkService,
    private readonly loggerService: LoggerService,
  ) {}

  private async resolveUserId(
    clerkUser: User,
    publicMetadata: Partial<IClerkPublicMetadata>,
  ): Promise<{
    resolvedBy: 'lookup' | 'metadata' | 'reconciled';
    userId: string;
  }> {
    const clerkUserId = clerkUser.id;
    const metadataUserId =
      typeof publicMetadata.user === 'string' ? publicMetadata.user : '';

    if (metadataUserId) {
      const currentUser =
        (await this.usersService.findOne({ _id: metadataUserId }, [])) ??
        (await this.usersService.findOne({ mongoId: metadataUserId }, []));
      const currentUserId = getEntityId(
        currentUser as Record<string, unknown> | null | undefined,
      );

      if (currentUserId) {
        return {
          resolvedBy: 'metadata',
          userId: currentUserId,
        };
      }
    }

    const user = await this.usersService.findOne({ clerkId: clerkUserId }, []);
    const currentUserId = getEntityId(
      user as Record<string, unknown> | null | undefined,
    );
    if (currentUserId) {
      return {
        resolvedBy: 'lookup',
        userId: currentUserId,
      };
    }

    // Self-heal: the clerkId on file no longer matches (rotated key, recreated
    // Clerk account, or a stale projection). Fall back to the verified primary
    // email and re-attach the live clerkId to the existing row so the user is
    // not locked out by an identity drift they cannot see or fix themselves.
    const reconciledUserId = await this.reconcileByEmail(clerkUser);
    if (reconciledUserId) {
      return {
        resolvedBy: 'reconciled',
        userId: reconciledUserId,
      };
    }

    throw new UnauthorizedException('User account not found');
  }

  /**
   * Attach the current clerkId to an existing local user matched by verified
   * primary email. Returns the local user id on success, '' when no safe match
   * exists. Only verified primary emails are trusted (see getPrimaryVerifiedEmail).
   */
  private async reconcileByEmail(clerkUser: User): Promise<string> {
    const email = getPrimaryVerifiedEmail(clerkUser);
    if (!email) {
      return '';
    }

    const existing = await this.usersService.findOne(
      { email, isDeleted: false },
      [],
    );
    const existingUserId = getEntityId(
      existing as Record<string, unknown> | null | undefined,
    );
    if (!existingUserId) {
      return '';
    }

    const previousClerkId = getRecordId(
      existing as Record<string, unknown> | null | undefined,
      'clerkId',
    );
    if (previousClerkId === clerkUser.id) {
      // Row already points at this clerkId (e.g. email lookup raced the clerkId
      // lookup); nothing to repair, just adopt it.
      return existingUserId;
    }

    try {
      await this.usersService.patch(existingUserId, {
        clerkId: clerkUser.id,
      });
      this.loggerService.warn(
        `Reconciled local user ${existingUserId} to Clerk id ${clerkUser.id} by verified email`,
        {
          clerkUserId: clerkUser.id,
          previousClerkId: previousClerkId || 'none',
          service: 'AuthIdentityResolverService',
          userId: existingUserId,
        },
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown reconcile error';
      this.loggerService.error(
        `Failed to reconcile local user ${existingUserId} to Clerk id ${clerkUser.id}: ${message}`,
        {
          clerkUserId: clerkUser.id,
          service: 'AuthIdentityResolverService',
          userId: existingUserId,
        },
      );
      return '';
    }

    return existingUserId;
  }

  private async findAccessibleOrganization(
    organizationCandidate: string,
    userId: string,
    members: MemberDocument[],
  ): Promise<OrganizationDocument | null> {
    if (!organizationCandidate) {
      return null;
    }

    const organization =
      (await this.organizationsService.findOne({
        _id: organizationCandidate,
        isDeleted: false,
      })) ??
      (await this.organizationsService.findOne({
        clerkOrganizationId: organizationCandidate,
        isDeleted: false,
      })) ??
      (await this.organizationsService.findOne({
        isDeleted: false,
        mongoId: organizationCandidate,
      }));

    const resolvedOrganizationId = getEntityId(
      organization as Record<string, unknown> | null | undefined,
    );

    if (!resolvedOrganizationId) {
      return null;
    }

    const isMember = members.some((member) => {
      const memberOrganizationId =
        getRecordId(asMemberRecord(member), 'organizationId') ||
        getRecordId(asMemberRecord(member), 'organization');

      return memberOrganizationId === resolvedOrganizationId;
    });
    const isOwner =
      getRecordId(organization as Record<string, unknown>, 'userId') ===
        userId ||
      getRecordId(organization as Record<string, unknown>, 'user') === userId;

    return isMember || isOwner ? organization : null;
  }

  private async resolveOrganization(
    publicMetadata: Partial<IClerkPublicMetadata>,
    userId: string,
    members: MemberDocument[],
    clerkOrgId?: string,
  ): Promise<OrganizationDocument | null> {
    if (clerkOrgId) {
      const orgFromClerk = await this.findAccessibleOrganization(
        clerkOrgId,
        userId,
        members,
      );
      if (orgFromClerk) {
        return orgFromClerk;
      }
    }

    const organizationCandidate =
      typeof publicMetadata.organization === 'string'
        ? publicMetadata.organization
        : '';

    const organizationFromMetadata = await this.findAccessibleOrganization(
      organizationCandidate,
      userId,
      members,
    );
    if (organizationFromMetadata) {
      return organizationFromMetadata;
    }

    const ownerOrganization = await this.organizationsService.findOne({
      isDeleted: false,
      user: userId,
    });
    if (
      getEntityId(
        ownerOrganization as Record<string, unknown> | null | undefined,
      )
    ) {
      return ownerOrganization;
    }

    for (const member of members) {
      const memberOrganizationId =
        getRecordId(asMemberRecord(member), 'organizationId') ||
        getRecordId(asMemberRecord(member), 'organization');

      if (!memberOrganizationId) {
        continue;
      }

      const organization = await this.organizationsService.findOne({
        _id: memberOrganizationId,
        isDeleted: false,
      });
      if (
        getEntityId(organization as Record<string, unknown> | null | undefined)
      ) {
        return organization;
      }
    }

    return null;
  }

  private async resolveBrand(
    publicMetadata: Partial<IClerkPublicMetadata>,
    organizationId: string,
    members: MemberDocument[],
  ): Promise<BrandDocument | null> {
    const brandCandidate =
      typeof publicMetadata.brand === 'string' ? publicMetadata.brand : '';

    if (brandCandidate) {
      const brandFromMetadata =
        (await this.brandsService.findOne({
          _id: brandCandidate,
          isDeleted: false,
          organization: organizationId,
        })) ??
        (await this.brandsService.findOne({
          isDeleted: false,
          mongoId: brandCandidate,
          organization: organizationId,
        }));

      if (
        getEntityId(
          brandFromMetadata as Record<string, unknown> | null | undefined,
        )
      ) {
        return brandFromMetadata;
      }
    }

    const memberForOrganization = members.find((member) => {
      const memberOrganizationId =
        getRecordId(asMemberRecord(member), 'organizationId') ||
        getRecordId(asMemberRecord(member), 'organization');

      return memberOrganizationId === organizationId;
    });

    const lastUsedBrandId =
      getRecordId(
        memberForOrganization as Record<string, unknown> | undefined,
        'lastUsedBrandId',
      ) ||
      getRecordId(
        memberForOrganization as Record<string, unknown> | undefined,
        'lastUsedBrand',
      );

    if (lastUsedBrandId) {
      const lastUsedBrand = await this.brandsService.findOne({
        _id: lastUsedBrandId,
        isDeleted: false,
        organization: organizationId,
      });

      if (
        getEntityId(lastUsedBrand as Record<string, unknown> | null | undefined)
      ) {
        return lastUsedBrand;
      }
    }

    return await this.brandsService.findOne({
      isDeleted: false,
      organization: organizationId,
    });
  }

  async resolve(
    user: User,
    options?: { clerkOrgId?: string },
  ): Promise<{
    brandId?: string;
    clerkUserId: string;
    organizationId?: string;
    resolvedBy: 'lookup' | 'metadata' | 'reconciled';
    userId: string;
  }> {
    const clerkUserId = user.id;
    if (!clerkUserId) {
      throw new UnauthorizedException('Missing user identity');
    }

    const publicMetadata =
      user.publicMetadata as unknown as IClerkPublicMetadata;
    const resolvedUser = await this.resolveUserId(user, publicMetadata);
    const members = await this.membersService.find({
      isActive: true,
      isDeleted: false,
      user: resolvedUser.userId,
    });
    const organization = await this.resolveOrganization(
      publicMetadata,
      resolvedUser.userId,
      members,
      options?.clerkOrgId,
    );
    const organizationId =
      getEntityId(organization as Record<string, unknown> | null | undefined) ||
      undefined;
    const brand = organizationId
      ? await this.resolveBrand(publicMetadata, organizationId, members)
      : null;
    const brandId =
      getEntityId(brand as Record<string, unknown> | null | undefined) ||
      undefined;

    const metadataPatch: Partial<IClerkPublicMetadata> = {
      brand: brandId,
      organization: organizationId,
      user: resolvedUser.userId,
    };
    const shouldRepairMetadata =
      metadataPatch.user !== publicMetadata.user ||
      metadataPatch.organization !== publicMetadata.organization ||
      metadataPatch.brand !== publicMetadata.brand;

    if (shouldRepairMetadata) {
      this.clerkService
        .updateUserPublicMetadata(clerkUserId, metadataPatch)
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Unknown Clerk error';
          this.loggerService.warn(
            `Failed to repair Clerk publicMetadata for ${clerkUserId}: ${message}`,
            {
              brandId,
              clerkUserId,
              organizationId,
              service: 'AuthIdentityResolverService',
              userId: resolvedUser.userId,
            },
          );
        });
    }

    return {
      brandId,
      clerkUserId,
      organizationId,
      resolvedBy: resolvedUser.resolvedBy,
      userId: resolvedUser.userId,
    };
  }
}
