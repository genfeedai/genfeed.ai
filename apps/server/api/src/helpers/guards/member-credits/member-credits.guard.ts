import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  resolveEffectiveSeatsLimit,
  UNLIMITED_SEATS_FAIR_USE_CEILING,
} from '@api/collections/organization-settings/utils/seat-policy.util';
import { PlanLimitExceededException } from '@api/helpers/exceptions/business/business-logic.exception';
import {
  getIsSuperAdmin,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { IAuthPublicMetadata } from '@api/shared/interfaces/auth/auth-public-metadata.interface';
import { IS_CLOUD_MODE } from '@genfeedai/config';
import { getUpgradeTierForLimit } from '@genfeedai/pricing';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class MemberCreditsGuard implements CanActivate {
  constructor(
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly membersService: MembersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Self-hosted/community deployments have no billing or seat concept.
    if (!IS_CLOUD_MODE) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (
      request as unknown as { user: { publicMetadata: IAuthPublicMetadata } }
    ).user;

    if (getIsSuperAdmin(user, request)) {
      return true;
    }

    const publicMetadata: IAuthPublicMetadata = user.publicMetadata;
    const organizationId =
      request.params.organizationId ||
      request.params.id ||
      publicMetadata.organization;

    const settings = await this.organizationSettingsService.findOne({
      organization: organizationId,
    });

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

    const tier =
      settings?.subscriptionTier ?? getSubscriptionTier(user, request);
    const effectiveSeatsLimit = resolveEffectiveSeatsLimit(
      tier,
      settings?.seatsLimit,
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

    throw new PlanLimitExceededException({
      currentCount: activeMembersCount,
      limit: effectiveSeatsLimit,
      resource: 'seats',
      upgradeTier: getUpgradeTierForLimit('seats', tier),
    });
  }
}
