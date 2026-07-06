import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  getIsSuperAdmin,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { IS_CLOUD_MODE } from '@genfeedai/config';
import { hasApiAccess } from '@genfeedai/pricing';
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
 * Gate that enforces the "Model B" API-access promise at API-key issuance:
 * only PAID tiers (Pro and above) may mint API keys. Free tiers
 * (Pay As You Go, BYOK) are blocked with an upgrade message.
 *
 * The entitlement is resolved from the org's subscription tier
 * (`getSubscriptionTier` → `hasApiAccess`), whose mapping is canonical in
 * `@genfeedai/pricing` (tier-entitlements.ts).
 *
 * API access as a paid entitlement is a MANAGED-CLOUD (SaaS) product boundary.
 * Self-hosted / community / desktop deployments (LOCAL & HYBRID modes) always
 * have full API access, so the gate is a no-op off cloud — matching how tiers
 * and billing only exist as a product boundary in the managed cloud.
 */
@Injectable()
export class ApiAccessGuard implements CanActivate {
  constructor(private readonly loggerService: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    // Non-cloud deployments have no tiers/billing — never gate API access.
    if (!IS_CLOUD_MODE) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const publicMetadata = user?.publicMetadata;

    if (!user || !publicMetadata) {
      this.loggerService.warn('ApiAccessGuard: No user found in request');
      throw new HttpException(
        {
          detail: 'Authentication required',
          title: 'Unauthorized',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Requests already authenticated by an API key implied the org was
    // entitled when the key was minted; request-time per-tier rate limiting
    // (ApiKeysService.checkRateLimit) is what throttles a downgraded org. Keep
    // this consistent with SubscriptionGuard, which also bypasses API keys.
    if (publicMetadata.isApiKey === true) {
      return true;
    }

    // Super admins bypass entitlement checks.
    if (getIsSuperAdmin(user, request)) {
      return true;
    }

    const tier = getSubscriptionTier(user, request);
    if (!hasApiAccess(tier)) {
      this.loggerService.warn('ApiAccessGuard: tier lacks API access', {
        tier,
        userId: user.id,
      });

      throw new ForbiddenException(
        'API access is available on paid plans. Upgrade to Pro, Scale, or Enterprise to create and use API keys.',
      );
    }

    return true;
  }
}
