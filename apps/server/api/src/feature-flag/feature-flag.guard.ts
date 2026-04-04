import { FEATURE_FLAG_KEY } from '@api/feature-flag/feature-flag.decorator';
import {
  type FeatureFlagAttributes,
  FeatureFlagService,
} from '@api/feature-flag/feature-flag.service';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

type FeatureFlagRequest = Request & {
  auth?: { publicMetadata?: { user?: string } };
  context?: { organizationId?: string; userId?: string };
  user?: { id?: string };
};

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const flagKey = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!flagKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FeatureFlagRequest>();
    const attributes = this.buildAttributes(request);

    if (this.featureFlagService.isEnabled(flagKey, attributes)) {
      return true;
    }

    throw new NotFoundException();
  }

  private buildAttributes(
    request: FeatureFlagRequest,
  ): FeatureFlagAttributes | undefined {
    const id =
      request.context?.userId ||
      request.user?.id ||
      request.auth?.publicMetadata?.user;
    const organizationId = request.context?.organizationId;

    if (!id && !organizationId) {
      return undefined;
    }

    return {
      ...(id ? { id } : {}),
      ...(organizationId ? { organizationId } : {}),
    };
  }
}
