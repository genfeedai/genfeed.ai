import {
  getIsSuperAdmin,
  getStripeSubscriptionStatus,
  getSubscriptionTier,
} from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
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

interface AuthenticatedRequest extends Omit<Request, 'user'> {
  user?: User;
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly loggerService: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const publicMetadata = user?.publicMetadata;

    if (!user || !publicMetadata) {
      this.loggerService.warn('SubscriptionGuard: No user found in request');
      throw new HttpException(
        {
          detail: 'Authentication required',
          title: 'Unauthorized',
        },
        HttpStatus.UNAUTHORIZED,
      );
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
