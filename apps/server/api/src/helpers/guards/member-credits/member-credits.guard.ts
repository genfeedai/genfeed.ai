import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  resolveEffectiveSeatsLimit,
  UNLIMITED_SEATS_FAIR_USE_CEILING,
} from '@api/collections/organization-settings/utils/seat-policy.util';
import { ConfigService } from '@api/config/config.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ByokService } from '@api/services/byok/byok.service';
import { IAuthPublicMetadata } from '@api/shared/interfaces/auth/auth-public-metadata.interface';
import { IS_SELF_HOSTED } from '@genfeedai/config';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
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
    // Self-hosted/community deployments have no billing or seat concept —
    // seats and credits are cloud-only constructs. Never gate member invites
    // there, regardless of what's stored on OrganizationSetting.
    if (IS_SELF_HOSTED) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (
      request as unknown as { user: { publicMetadata: IAuthPublicMetadata } }
    ).user;
    const publicMetadata: IAuthPublicMetadata = user.publicMetadata;
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
      false,
    );

    const activeMembersCount = activeMembers.docs.length;

    const effectiveSeatsLimit = resolveEffectiveSeatsLimit(
      settings.subscriptionTier,
      settings.seatsLimit,
    );

    // Unlimited-seat tiers (Pro/Scale/Enterprise) are never gated by seat
    // count — credits are the only meter. Only the fair-use anti-abuse
    // ceiling can block them, and it is not a billing gate.
    if (effectiveSeatsLimit === null) {
      if (activeMembersCount >= UNLIMITED_SEATS_FAIR_USE_CEILING) {
        throw new ForbiddenException(
          'This organization has reached its member fair-use limit. Contact support to raise it.',
        );
      }

      return true;
    }

    if (activeMembersCount < effectiveSeatsLimit) {
      return true;
    }

    (request as unknown as Record<string, unknown>).seatsLimit = {
      current: activeMembersCount, // Pass the actual current count, not the limit
      id: settings.id.toString(),
    };

    return super.canActivate(context);
  }
}
