import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  buildRcKey,
  buildRcKeysSetKey,
  RC_KEYS_SET_TTL,
  RC_PREFIX,
  RC_TTL,
} from '@api/common/constants/request-context-cache.constants';
import { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { User } from '@clerk/backend';
import { IS_SELF_HOSTED } from '@genfeedai/config';
import { SubscriptionsService } from '@genfeedai/ee-billing/subscriptions';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithContext extends Request {
  user?: User;
  context?: IRequestContext;
}

const SELF_HOSTED_CONTEXT_CACHE_KEY = `${RC_PREFIX}:self-hosted`;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly context = { service: RequestContextMiddleware.name };

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly prisma: PrismaService,
  ) {}

  async use(
    req: RequestWithContext,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (IS_SELF_HOSTED) {
      await this.hydrateSelfHostedContext(req);
      return next();
    }

    const user = req.user;

    if (!user) {
      return next();
    }

    const publicMetadata =
      user.publicMetadata as unknown as IClerkPublicMetadata;
    const userId = publicMetadata.user ?? '';
    const organizationId = publicMetadata.organization ?? '';
    const brandId = publicMetadata.brand ?? undefined;

    if (!userId || !organizationId) {
      return next();
    }

    const cacheKey = buildRcKey(userId, organizationId, brandId || undefined);

    try {
      const publisher = this.redisService.getPublisher();

      if (publisher) {
        const cached = await publisher.get(cacheKey);
        if (cached) {
          req.context = JSON.parse(cached) as IRequestContext;
          return next();
        }
      }

      const [orgSetting, subscription] = await Promise.all([
        this.organizationSettingsService.findOne({
          isDeleted: false,
          organization: organizationId,
        }),
        this.subscriptionsService.findOne({
          isDeleted: false,
          organization: organizationId,
        }),
      ]);

      const requestContext: IRequestContext = {
        brandId: brandId || undefined,
        hydratedAt: Date.now(),
        isSuperAdmin: publicMetadata.isSuperAdmin === true,
        organizationId,
        stripeSubscriptionStatus:
          subscription?.status ?? publicMetadata.stripeSubscriptionStatus ?? '',
        subscriptionTier:
          orgSetting?.subscriptionTier ?? publicMetadata.subscriptionTier ?? '',
        userId,
      };

      if (publisher) {
        const keysSetKey = buildRcKeysSetKey(userId);
        await Promise.all([
          publisher.setEx(cacheKey, RC_TTL, JSON.stringify(requestContext)),
          publisher.sAdd(keysSetKey, cacheKey),
          publisher.expire(keysSetKey, RC_KEYS_SET_TTL),
        ]);
      }

      req.context = requestContext;
    } catch (error: unknown) {
      this.logger.error('RequestContextMiddleware failed', error, this.context);
    }

    return next();
  }

  private async hydrateSelfHostedContext(
    req: RequestWithContext,
  ): Promise<void> {
    const publisher = this.redisService.getPublisher();

    try {
      if (publisher) {
        const cached = await publisher.get(SELF_HOSTED_CONTEXT_CACHE_KEY);
        if (cached) {
          req.context = JSON.parse(cached) as IRequestContext;
          return;
        }
      }

      const [defaultOrg, defaultUser] = await Promise.all([
        this.prisma.organization.findFirst({ where: { isDefault: true } }),
        this.prisma.user.findFirst({ where: { isDefault: true } }),
      ]);

      if (!defaultOrg || !defaultUser) {
        return;
      }

      const settings = await this.organizationSettingsService.findOne({
        isDeleted: false,
        organization: defaultOrg.id,
      });

      const requestContext: IRequestContext = {
        brandId: undefined,
        hydratedAt: Date.now(),
        isSuperAdmin: true,
        organizationId: defaultOrg.id,
        stripeSubscriptionStatus: 'active',
        subscriptionTier: settings?.subscriptionTier || 'free',
        userId: defaultUser.id,
      };

      if (publisher) {
        await publisher.setEx(
          SELF_HOSTED_CONTEXT_CACHE_KEY,
          RC_TTL,
          JSON.stringify(requestContext),
        );
      }

      req.context = requestContext;
    } catch (error: unknown) {
      this.logger.error(
        'Self-hosted context hydration failed',
        error,
        this.context,
      );
    }
  }
}
