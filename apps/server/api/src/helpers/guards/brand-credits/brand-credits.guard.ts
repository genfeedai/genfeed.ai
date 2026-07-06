import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PlanLimitExceededException } from '@api/helpers/exceptions/business/business-logic.exception';
import {
  getIsSuperAdmin,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { IAuthPublicMetadata } from '@api/shared/interfaces/auth/auth-public-metadata.interface';
import { IS_CLOUD_MODE } from '@genfeedai/config';
import {
  getBrandLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class BrandCreditsGuard implements CanActivate {
  constructor(
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly brandsService: BrandsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Plan limits are a managed-cloud product boundary. Self-hosted/community
    // deployments must not lose core brand creation.
    if (!IS_CLOUD_MODE) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as { user: User }).user;

    if (getIsSuperAdmin(user, request)) {
      return true;
    }

    const publicMetadata = user.publicMetadata as IAuthPublicMetadata;

    const settings = await this.organizationSettingsService.findOne({
      organization: publicMetadata.organization,
    });

    const tier =
      settings?.subscriptionTier ?? getSubscriptionTier(user, request);
    const brandLimit = getBrandLimitForTier(tier);

    if (brandLimit === null) {
      return true;
    }

    const existingBrands = await this.brandsService.findAll(
      {
        where: {
          isDeleted: false,
          organization: publicMetadata.organization,
        },
      },
      { pagination: false },
      false,
    );

    const brandCount = existingBrands.docs.length;

    if (brandCount < brandLimit) {
      return true;
    }

    throw new PlanLimitExceededException({
      currentCount: brandCount,
      limit: brandLimit,
      resource: 'brands',
      upgradeTier: getUpgradeTierForLimit('brands', tier),
    });
  }
}
