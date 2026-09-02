import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  resolveEffectiveSeatsLimit,
  UNLIMITED_SEATS_FAIR_USE_CEILING,
} from '@api/collections/organization-settings/utils/seat-policy.util';
import { PlanLimitExceededException } from '@api/exceptions/business-logic.exception';
import {
  getIsSuperAdmin,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { isCloudDeployment } from '@genfeedai/config';
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
    if (!isCloudDeployment()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as { user: User }).user;

    if (getIsSuperAdmin(user, request)) {
      return true;
    }

    // Express 5 route params can be repeated, so a param reads as
    // `string | string[]`. Tenant lookups take a single id.
    const routeOrganizationId =
      request.params.organizationId || request.params.id;
    const organizationId =
      (Array.isArray(routeOrganizationId)
        ? routeOrganizationId[0]
        : routeOrganizationId) || user.organizationId;

    const settings = await this.organizationSettingsService.findOne({
      organizationId: organizationId,
    });

    const activeMembersCount = await this.membersService.count({
      isDeleted: false,
      organizationId: organizationId,
    });

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
