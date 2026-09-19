import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  getIsSuperAdmin,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { isCloudDeployment } from '@genfeedai/config';
import { SubscriptionTier } from '@genfeedai/contracts';
import { hasCleanExportAccess } from '@genfeedai/pricing';
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
 * Cloud-only gate: an ingredient export requested without a watermark (a
 * "clean" original) requires Pro or above. Branded/watermarked exports stay
 * available to every tier, so the gate only engages for `watermark: false`
 * bodies — free tiers must still be able to render their branded preview.
 *
 * Self-hosted / community deployments always allow originals; they never had
 * a tier/billing boundary to gate against (`isCloudDeployment`).
 */
@Injectable()
export class CleanExportAccessGuard implements CanActivate {
  constructor(private readonly loggerService: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!isCloudDeployment()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Watermarked/branded exports are not a paid entitlement — only the
    // unwatermarked ("clean") export path is gated.
    const body = request.body as { watermark?: boolean } | undefined;
    if (body?.watermark !== false) {
      return true;
    }

    const user = request.user;

    if (!user) {
      this.loggerService.warn(
        'CleanExportAccessGuard: No user found in request',
      );
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
    if (!hasCleanExportAccess(tier)) {
      this.loggerService.warn(
        'CleanExportAccessGuard: tier lacks clean-export access',
        {
          tier,
          userId: user.id,
        },
      );

      throw new ForbiddenException({
        code: 'PLAN_LIMIT_EXCEEDED',
        detail:
          'Clean, unwatermarked exports are available on paid plans. Upgrade to Pro to download originals.',
        meta: {
          resource: 'clean-export',
          upgradeTier: SubscriptionTier.PRO,
        },
        title: 'Clean export requires a paid plan',
      });
    }

    return true;
  }
}
