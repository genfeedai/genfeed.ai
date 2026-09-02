import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  getIsSuperAdmin,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { isCloudDeployment } from '@genfeedai/config';
import { SubscriptionTier } from '@genfeedai/contracts';
import { hasTrainingAccess } from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

interface AuthenticatedRequest extends Omit<Request, 'user'> {
  user?: User;
}

/**
 * Cloud-only gate: custom model training (LoRA) requires Pro or above.
 * Self-hosted / community deployments always allow training.
 */
@Injectable()
export class TrainingAccessGuard implements CanActivate {
  constructor(private readonly loggerService: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isCloudDeployment()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      this.loggerService.warn('TrainingAccessGuard: No user found in request');
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

    if (getIsSuperAdmin(user, request)) {
      return true;
    }

    const tier = getSubscriptionTier(user, request);
    if (!hasTrainingAccess(tier)) {
      this.loggerService.warn(
        'TrainingAccessGuard: tier lacks training access',
        {
          tier,
          userId: user.id,
        },
      );

      throw new ForbiddenException({
        code: 'PLAN_LIMIT_EXCEEDED',
        detail:
          'Custom model training is available on paid plans. Upgrade to Pro to train brand models.',
        meta: {
          resource: 'training',
          upgradeTier: SubscriptionTier.PRO,
        },
        title: 'Training requires a paid plan',
      });
    }

    return true;
  }
}
