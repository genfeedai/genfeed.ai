import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FEATURE_FLAG_KEY } from '@api/feature-flag/feature-flag.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import type { PlatformFlagKey } from '@genfeedai/contracts/constants';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

type FeatureFlagRequest = Request & {
  context?: { isSuperAdmin?: boolean };
  user?: AuthenticatedUser;
};

/**
 * Global guard for `@FeatureFlag` (#5468): a route whose Admin flag is off
 * answers 404, hiding the module rather than advertising it. Registered after
 * the auth guard, so an anonymous caller still gets 401 first. Superadmins
 * pass, so an operator can inspect a module that is off for everyone else.
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagKey = this.reflector.getAllAndOverride<
      PlatformFlagKey | undefined
    >(FEATURE_FLAG_KEY, [context.getHandler(), context.getClass()]);
    if (!flagKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FeatureFlagRequest>();
    if (getIsSuperAdmin(request.user, request)) {
      return true;
    }

    const { flags } = await this.platformSettingsService.getFeatureSettings();
    if (flags[flagKey]) {
      return true;
    }

    throw new NotFoundException('Route');
  }
}
