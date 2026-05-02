import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
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
export class MemberCreditsGuard extends CreditsGuard implements CanActivate {
  constructor(
    reflector: Reflector,
    creditsUtilsService: CreditsUtilsService,
    modelsService: ModelsService,
    byokService: ByokService,
    loggerService: LoggerService,
    configService: ConfigService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly membersService: MembersService,
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
    const organizationId =
      request.params.organizationId ||
      request.params.id ||
      publicMetadata.organization;

    const settings = await this.organizationSettingsService.findOne({
      organization: organizationId,
    });

    if (!settings) {
      return true;
    }

    const activeMembers = await this.membersService.findAll(
      {
        where: {
          isDeleted: false,
          organization: organizationId,
        },
      },
      { pagination: false },
    );

    const activeMembersCount = activeMembers.docs.length;

    if (activeMembersCount < settings.seatsLimit) {
      return true;
    }

    (request as unknown as Record<string, unknown>).seatsLimit = {
      current: activeMembersCount, // Pass the actual current count, not the limit
      id: settings._id.toString(),
    };

    return super.canActivate(context);
  }
}
