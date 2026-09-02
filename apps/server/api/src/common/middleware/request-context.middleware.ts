import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  buildRcKey,
  buildRcKeysSetKey,
  RC_KEYS_SET_TTL,
  RC_PREFIX,
  RC_TTL,
} from '@api/common/constants/request-context-cache.constants';
import { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { SubscriptionStatus } from '@genfeedai/contracts';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithContext extends Request {
  user?: AuthenticatedUser;
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
    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly prisma: PrismaService,
  ) {}

  async use(
    req: RequestWithContext,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    await this.hydrate(req);
    return next();
  }

  /**
   * Hydrate `req.context` from the authenticated identity.
   *
   * Express middleware runs before Nest guards, so for Better Auth / API-key
   * requests `req.user` does not exist yet when `use()` runs. The global
   * `CombinedAuthGuard` therefore calls this again right after it sets
   * `req.user`, which is what makes `req.context` available to every guard,
   * interceptor, and controller behind it (models, subscription, super-admin,
   * feature flags, rate limits). Idempotent: an already-hydrated request is
   * left untouched.
   */
  async hydrate(req: RequestWithContext): Promise<void> {
    if (req.context) {
      return;
    }

    if (isSelfHostedDeployment()) {
      await this.hydrateSelfHostedContext(req);
      return;
    }

    const user = req.user;

    if (!user) {
      return;
    }

    const userId = user.userId || user.id || '';
    const organizationId = user.organizationId ?? '';
    const brandId = user.brandId ?? undefined;

    if (!userId || !organizationId) {
      return;
    }

    const cacheKey = buildRcKey(userId, organizationId, brandId || undefined);

    try {
      const publisher = this.redisService.getPublisher();

      if (publisher) {
        const cached = await publisher.get(cacheKey);
        if (cached) {
          req.context = JSON.parse(cached) as IRequestContext;
          return;
        }
      }

      const [orgSetting, subscription] = await Promise.all([
        this.organizationSettingsService.findOne({
          organizationId: organizationId,
        }),
        this.subscriptionsService.findOne({
          organizationId: organizationId,
        }),
      ]);

      const requestContext: IRequestContext = {
        brandId: brandId || undefined,
        hydratedAt: Date.now(),
        isSuperAdmin: user.isSuperAdmin === true,
        organizationId,
        stripeSubscriptionStatus:
          subscription?.status ?? user.stripeSubscriptionStatus ?? '',
        subscriptionTier:
          orgSetting?.subscriptionTier ?? user.subscriptionTier ?? '',
        userId,
      };

      if (publisher) {
        const keysSetKey = buildRcKeysSetKey(userId);
        await Promise.all([
          publisher.setex(cacheKey, RC_TTL, JSON.stringify(requestContext)),
          publisher.sadd(keysSetKey, cacheKey),
          publisher.expire(keysSetKey, RC_KEYS_SET_TTL),
        ]);
      }

      req.context = requestContext;
    } catch (error: unknown) {
      this.logger.error('RequestContextMiddleware failed', error, this.context);
    }
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
        organizationId: defaultOrg.id,
      });
      const defaultBrand = await this.prisma.brand.findFirst({
        where: {
          isDefault: true,
          isDeleted: false,
          organizationId: defaultOrg.id,
        },
      });

      const requestContext: IRequestContext = {
        brandId: defaultBrand?.id,
        hydratedAt: Date.now(),
        isSuperAdmin: true,
        organizationId: defaultOrg.id,
        stripeSubscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionTier: settings?.subscriptionTier || 'free',
        userId: defaultUser.id,
      };

      if (publisher) {
        await publisher.setex(
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
