import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FEATURE_FLAG_KEY } from '@api/feature-flag/feature-flag.decorator';
import {
  type FeatureFlagAttributes,
  FeatureFlagService,
} from '@api/feature-flag/feature-flag.service';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

type FeatureFlagRequest = Request & {
  auth?: { userId?: string };
  context?: {
    organizationId?: string;
    subscriptionTier?: string;
    userId?: string;
  };
  user?: {
    email?: string;
    emailAddresses?: Array<{
      emailAddress?: string | null;
      id?: string | null;
    }>;
    id?: string;
    primaryEmailAddressId?: string | null;
    userId?: string;
  };
};

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagKey = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!flagKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FeatureFlagRequest>();
    const attributes = this.buildAttributes(request);

    if (await this.featureFlagService.isEnabled(flagKey, attributes)) {
      return true;
    }

    throw new NotFoundException('Route');
  }

  private buildAttributes(
    request: FeatureFlagRequest,
  ): FeatureFlagAttributes | undefined {
    const id =
      request.context?.userId ||
      request.user?.userId ||
      request.user?.id ||
      request.auth?.userId;
    const organizationId = request.context?.organizationId;
    const plan = request.context?.subscriptionTier;
    const isInternal = resolveIsInternal(request);

    if (!id && !organizationId && !plan && typeof isInternal !== 'boolean') {
      return undefined;
    }

    return {
      ...(id ? { id } : {}),
      ...(organizationId ? { organizationId } : {}),
      ...(plan ? { plan } : {}),
      ...(typeof isInternal === 'boolean' ? { is_internal: isInternal } : {}),
    };
  }
}

function resolveIsInternal(request: FeatureFlagRequest): boolean | undefined {
  const email = resolveRequestEmail(request);
  if (!email) {
    return undefined;
  }

  return email.endsWith('@genfeed.ai');
}

function resolveRequestEmail(request: FeatureFlagRequest): string | undefined {
  const user = request.user;
  if (!user) {
    return undefined;
  }

  const primary = user.emailAddresses?.find(
    (entry) => entry.id && entry.id === user.primaryEmailAddressId,
  )?.emailAddress;
  const fallback = user.emailAddresses?.[0]?.emailAddress || user.email;
  const email = primary || fallback;
  if (typeof email !== 'string' || email.trim() === '') {
    return undefined;
  }

  return email.trim().toLowerCase();
}
