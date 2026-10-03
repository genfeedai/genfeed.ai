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
import { isAdminIpAllowed } from '@api/helpers/utils/admin-ip-allowlist/admin-ip-allowlist.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { SubscriptionStatus } from '@genfeedai/contracts';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/contracts/interfaces/billing';
import { isBearerScheme } from '@libs/auth/authorization-header';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithContext extends Request {
  user?: AuthenticatedUser;
  context?: IRequestContext;
  /** Set by the in-process gateway before authorized selected context is appended. */
  generationOriginalPrompt?: string;
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
   * feature flags, rate limits). Idempotent: an already-hydrated request keeps
   * its context and only has the admin IP binding re-applied.
   */
  async hydrate(req: RequestWithContext): Promise<void> {
    await this.hydrateContext(req);
    this.bindSuperAdminToAdminIp(req);
  }

  /**
   * Super-admin power is honoured only from `ADMIN_ALLOWED_IPS`. Applied after
   * the Redis read/write so the cached context keeps the account's role and
   * every request is judged on its own client IP.
   */
  private bindSuperAdminToAdminIp(req: RequestWithContext): void {
    const isClaimingSuperAdmin =
      req.context?.isSuperAdmin === true || req.user?.isSuperAdmin === true;

    if (!isClaimingSuperAdmin || isAdminIpAllowed(req)) {
      return;
    }

    if (req.context) {
      req.context = { ...req.context, isSuperAdmin: false };
    }
    if (req.user) {
      req.user = { ...req.user, isSuperAdmin: false };
    }
  }

  private async hydrateContext(req: RequestWithContext): Promise<void> {
    if (req.context) {
      return;
    }

    const user = req.user;

    if (isSelfHostedDeployment() && !user) {
      // Guards authenticate bearer credentials after Express middleware runs.
      // Default context here would make bootstrap return another workspace.
      if (isBetterAuthEnabled() && isBearerScheme(req.headers?.authorization)) {
        return;
      }
      await this.hydrateSelfHostedContext(req);
      return;
    }

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
