import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { PlanLimitExceededException } from '@api/exceptions/business-logic.exception';
import {
  getIsSuperAdmin,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { generateLabel } from '@api/shared/utils/label/label.util';
import { isCloudDeployment } from '@genfeedai/config';
import type { OrganizationOption } from '@genfeedai/contracts/interfaces';
import {
  getOrganizationLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface CreateOrganizationOperationInput {
  billingAccountId?: string;
  description?: string;
  label: string;
}

export interface OrganizationSelectionResult {
  brand: { id: string; label: string };
  organization: { id: string; label: string };
}

@Injectable()
export class OrganizationsOperationsService {
  constructor(
    private readonly billingAccountsService: BillingAccountsService,
    private readonly brandsService: BrandsService,
    private readonly membersService: MembersService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly organizationsService: OrganizationsService,
    private readonly rolesService: RolesService,
    private readonly usersService: UsersService,
    private readonly userAccessCacheService: UserAccessCacheService,
  ) {}

  async canUserReadEntity(
    user: User,
    organization: OrganizationDocument,
    hasSuperAdminAccess = getIsSuperAdmin(user),
  ): Promise<boolean> {
    if (hasSuperAdminAccess) {
      return true;
    }

    const organizationId = organization?.id?.toString();
    const userId = this.resolveUserId(user);
    if (!organizationId || !userId) {
      return false;
    }

    if (
      organizationId === user.organizationId ||
      this.isOrganizationOwner(organization, userId)
    ) {
      return true;
    }

    const member = await this.membersService.findOne({
      isActive: true,
      organizationId,
      userId,
    });

    return Boolean(member);
  }

  async findMine(user: User): Promise<OrganizationOption[]> {
    const userId = this.requireUserId(user);
    const members = await this.membersService.findActiveForUserAccess(userId);
    const organizationIds = [
      ...new Set(
        members.map((member) => member.organizationId).filter(Boolean),
      ),
    ];

    if (!organizationIds.length) {
      return [];
    }

    const organizations = await Promise.all(
      organizationIds.map((organizationId) =>
        this.organizationsService.findOne({
          id: organizationId,
          isDeleted: false,
        }),
      ),
    );

    return Promise.all(
      organizations
        .filter(
          (organization): organization is NonNullable<typeof organization> =>
            organization !== null,
        )
        .map(async (organization) => {
          const brand = await this.brandsService.findOne({
            isDeleted: false,
            organizationId: organization.id,
          });

          return {
            brand: brand
              ? { id: brand.id.toString(), label: brand.label }
              : null,
            id: organization.id.toString(),
            isActive: user.organizationId === organization.id.toString(),
            isOwner: this.isOrganizationOwner(organization, userId),
            label: organization.label,
            slug: organization.slug ?? '',
          };
        }),
    );
  }

  async createOrganization(
    input: CreateOrganizationOperationInput,
    user: User,
  ): Promise<OrganizationSelectionResult> {
    const userId = this.requireUserId(user);
    const label = input.label?.trim();
    if (!label) {
      throw new HttpException(
        { detail: 'Organization name is required', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.assertOrganizationCreationAllowed(user, userId);

    const userDocument = await this.usersService.findOne({ id: userId });
    if (!userDocument) {
      throw new HttpException(
        { detail: 'User document not found', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    const slug = await this.organizationsService.generateUniqueSlug(label);
    const organization = await this.organizationsService.create({
      isSelected: false,
      label,
      slug,
      userId,
    });
    const organizationId = organization.id.toString();

    await this.organizationSettingsService.ensureForOrganization(
      organization.id,
    );

    const brand = await this.brandsService.create({
      backgroundColor: '#000000',
      description:
        input.description ?? 'Default description. Use it as a pre-prompt',
      fontFamily: 'montserrat-black',
      isSelected: true,
      label,
      organizationId: organization.id,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      slug: generateLabel('brand'),
      userId,
    } as unknown as Parameters<BrandsService['create']>[0]);

    const role = await this.findProvisioningRole();
    await this.membersService.create({
      isActive: true,
      organizationId: organization.id,
      roleId: String(role.id),
      userId,
    } as unknown as Parameters<MembersService['create']>[0]);

    const settings = await this.organizationSettingsService.findOne({
      organizationId: organization.id,
    });
    await this.billingAccountsService.ensureForOrganization({
      billingAccountId: input.billingAccountId,
      label,
      organizationId,
      planTier: settings?.subscriptionTier ?? null,
      userId,
    });

    await this.usersService.patch(userId, {
      lastUsedOrganizationId: organizationId,
    });
    await this.membersService.setLastUsedBrand(
      {
        isActive: true,
        isDeleted: false,
        organizationId,
        userId,
      },
      brand.id.toString(),
    );
    await this.userAccessCacheService.invalidateAll(userId);

    return {
      brand: { id: brand.id.toString(), label: brand.label },
      organization: { id: organizationId, label: organization.label },
    };
  }

  async switchOrganization(
    organizationId: string,
    user: User,
  ): Promise<OrganizationSelectionResult> {
    const userId = this.requireUserId(user);
    const member = await this.membersService.findOne({
      isActive: true,
      organizationId,
      userId,
    });

    if (!member && !getIsSuperAdmin(user)) {
      throw new HttpException(
        {
          detail: 'You are not a member of this organization',
          title: 'Forbidden',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    let brand = member?.lastUsedBrandId
      ? await this.brandsService.findOne({
          id: member.lastUsedBrandId,
          organizationId,
        })
      : null;
    if (!brand) {
      brand = await this.brandsService.findOne({ organizationId });
    }

    if (!brand) {
      throw new HttpException(
        { detail: 'No brand found for this organization', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    await this.usersService.patch(userId, {
      lastUsedOrganizationId: organizationId,
    });
    if (member) {
      await this.membersService.setLastUsedBrand(
        {
          isActive: true,
          isDeleted: false,
          organizationId,
          userId,
        },
        brand.id.toString(),
      );
    }
    await this.userAccessCacheService.invalidateAll(userId);

    const organization = await this.organizationsService.findOne({
      id: organizationId,
    });

    return {
      brand: { id: brand.id.toString(), label: brand.label },
      organization: {
        id: organizationId,
        label: organization?.label ?? '',
      },
    };
  }

  private async assertOrganizationCreationAllowed(
    user: User,
    userId: string,
  ): Promise<void> {
    if (!isCloudDeployment() || getIsSuperAdmin(user)) {
      return;
    }

    const settings = user.organizationId
      ? await this.organizationSettingsService.findOne({
          organizationId: user.organizationId,
        })
      : null;
    const tier = settings?.subscriptionTier ?? getSubscriptionTier(user);
    const organizationLimit = getOrganizationLimitForTier(tier);
    if (organizationLimit === null) {
      return;
    }

    const organizationCount = await this.organizationsService.count({
      isDeleted: false,
      userId,
    });
    if (organizationCount < organizationLimit) {
      return;
    }

    throw new PlanLimitExceededException({
      currentCount: organizationCount,
      limit: organizationLimit,
      resource: 'organizations',
      upgradeTier: getUpgradeTierForLimit('organizations', tier),
    });
  }

  private async findProvisioningRole() {
    const role =
      (await this.rolesService.findOne({ key: 'admin' })) ??
      (await this.rolesService.findOne({ key: 'user' }));
    if (!role) {
      throw new HttpException(
        { detail: 'No role found to assign', title: 'Internal Server Error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return role;
  }

  private isOrganizationOwner(
    organization: { userId?: string | null },
    userId: string,
  ): boolean {
    return organization.userId === userId;
  }

  private requireUserId(user: User): string {
    const userId = this.resolveUserId(user);
    if (!userId) {
      throw new HttpException(
        { detail: 'User not found in metadata', title: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return userId;
  }

  private resolveUserId(user: User): string | undefined {
    return user.userId ?? user.id;
  }
}
