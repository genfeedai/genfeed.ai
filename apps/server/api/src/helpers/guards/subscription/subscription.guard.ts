import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  getIsSuperAdmin,
  getStripeSubscriptionStatus,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

export interface SubscriptionGuardRequest extends Omit<Request, 'user'> {
  user?: User;
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly loggerService: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    return this.assertActive(
      context.switchToHttp().getRequest<SubscriptionGuardRequest>(),
    );
  }

  /**
   * Explicit-input subscription check. Shared by the HTTP guard adapter above
   * and by the in-process agent generation gateway.
   */
  assertActive(request: SubscriptionGuardRequest): boolean {
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
      subscriptionStatus === SubscriptionStatus.TRIALING ||
      getSubscriptionTier(user, request) === SubscriptionTier.BYOK;

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
}
