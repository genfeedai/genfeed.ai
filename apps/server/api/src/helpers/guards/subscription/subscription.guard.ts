import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  ORGANIZATION_MODULE_KEY,
  type OrganizationModuleEndpointPolicy,
} from '@api/common/organization-modules/organization-module.decorator';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import {
  getIsSuperAdmin,
  getStripeSubscriptionStatus,
} from '@api/helpers/utils/auth/auth.util';
import { hasOrganizationBilling } from '@genfeedai/config';
import { SubscriptionStatus } from '@genfeedai/contracts';
import {
  ORGANIZATION_MODULES,
  type OrganizationModuleId,
} from '@genfeedai/contracts/constants';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export interface SubscriptionGuardRequest extends Omit<Request, 'user'> {
  user?: User;
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly reflector: Reflector,
    private readonly creditsUtilsService: CreditsUtilsService,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const creditsConfig = this.reflector.getAllAndOverride<CreditsConfig>(
      CREDITS_KEY,
      targets,
    );
    const modulePolicy = this.reflector.getAllAndOverride<
      OrganizationModuleEndpointPolicy | undefined
    >(ORGANIZATION_MODULE_KEY, targets);

    return this.assertActive(
      context.switchToHttp().getRequest<SubscriptionGuardRequest>(),
      creditsConfig,
      modulePolicy?.moduleId,
    );
  }

  /**
   * Explicit-input subscription check. Shared by the HTTP guard adapter above
   * and by the in-process agent generation gateway.
   *
   * An organization with credits left is treated like a subscribed one, except
   * on routes owned by a subscription-only module (`requiresSubscription`).
   * The balance is read from the wallet, never from a client snapshot.
   */
  async assertActive(
    request: SubscriptionGuardRequest,
    creditsConfig?: CreditsConfig,
    moduleId?: OrganizationModuleId,
  ): Promise<boolean> {
    const user = request.user;

    if (!user) {
      this.loggerService.warn('SubscriptionGuard: No user found in request');
      throw new HttpException(
        {
          detail: 'Authentication required',
          title: 'Unauthorized',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Metered routes enforce balance and model access downstream.
    if (creditsConfig) {
      return true;
    }

    if (user.isApiKey === true) {
      return true;
    }

    // Super admins bypass subscription check
    if (getIsSuperAdmin(user, request)) {
      return true;
    }

    const subscriptionStatus = getStripeSubscriptionStatus(user, request);
    const isActive =
      subscriptionStatus === SubscriptionStatus.ACTIVE ||
      subscriptionStatus === SubscriptionStatus.TRIALING;

    if (!isActive && (await this.hasCreditsInPlaceOfPlan(user, moduleId))) {
      return true;
    }

    if (!isActive) {
      this.loggerService.warn('SubscriptionGuard: No active subscription', {
        subscriptionStatus,
        userId: user.id,
      });

      throw new HttpException(
        {
          detail:
            'An active subscription is required to use this feature. Please subscribe to a plan.',
          title: 'Active subscription required',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }

  private async hasCreditsInPlaceOfPlan(
    user: User,
    moduleId: OrganizationModuleId | undefined,
  ): Promise<boolean> {
    if (!hasOrganizationBilling() || !user.organizationId) {
      return false;
    }
    // Designated subscription modules (#6578) stay subscription-only; an
    // owner we cannot resolve is treated the same way.
    if (
      moduleId &&
      (!Object.hasOwn(ORGANIZATION_MODULES, moduleId) ||
        ORGANIZATION_MODULES[moduleId].requiresSubscription)
    ) {
      return false;
    }

    try {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          user.organizationId,
        );
      return balance > 0;
    } catch (error: unknown) {
      // Fail closed: an unreadable wallet keeps the subscription requirement.
      this.loggerService.warn('SubscriptionGuard: credit balance read failed', {
        error: error instanceof Error ? error.message : String(error),
        organizationId: user.organizationId,
      });
      return false;
    }
  }
}
