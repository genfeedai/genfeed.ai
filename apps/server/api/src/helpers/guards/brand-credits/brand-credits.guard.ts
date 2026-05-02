import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { ConfigService } from '@api/config/config.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

@Injectable()
export class BrandCreditsGuard extends CreditsGuard implements CanActivate {
  constructor(
    reflector: Reflector,
    creditsUtilsService: CreditsUtilsService,
    modelsService: ModelsService,
    byokService: ByokService,
    loggerService: LoggerService,
    configService: ConfigService,

    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly brandsService: BrandsService,
  ) {
    super(
      reflector,
      creditsUtilsService,
      modelsService,
      byokService,
      loggerService,
      configService,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (
      request as unknown as { user: { publicMetadata: IClerkPublicMetadata } }
    ).user;
    const publicMetadata: IClerkPublicMetadata = user.publicMetadata;

    const settings = await this.organizationSettingsService.findOne({
      organization: publicMetadata.organization,
    });

    if (!settings) {
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
    );

    const brandCount = existingBrands.docs.length;

    if (brandCount < settings.brandsLimit) {
      return true;
    }

    (request as unknown as Record<string, unknown>).brandsLimit = {
      current: brandCount, // Pass the actual current count, not the limit
      id: settings._id.toString(),
    };

    return super.canActivate(context);
  }
}
