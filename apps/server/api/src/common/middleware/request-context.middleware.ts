import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import {
  Organization,
  type OrganizationDocument,
} from '@api/collections/organizations/schemas/organization.schema';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import {
  type UserDocument,
  User as UserSchema,
} from '@api/collections/users/schemas/user.schema';
import {
  buildRcKey,
  buildRcKeysSetKey,
  RC_KEYS_SET_TTL,
  RC_TTL,
} from '@api/common/constants/request-context-cache.constants';
import { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { IS_SELF_HOSTED } from '@genfeedai/config';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { NextFunction, Request, Response } from 'express';
import type { Model } from 'mongoose';

export interface RequestWithContext extends Request {
  user?: User;
  context?: IRequestContext;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly context = { service: RequestContextMiddleware.name };

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly subscriptionsService: SubscriptionsService,
    @InjectModel(Organization.name, DB_CONNECTIONS.AUTH)
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(UserSchema.name, DB_CONNECTIONS.AUTH)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async use(
    req: RequestWithContext,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (IS_SELF_HOSTED) {
      try {
        const [defaultOrg, defaultUser] = await Promise.all([
          this.organizationModel.findOne({ isDefault: true }).lean(),
          this.userModel.findOne({ isDefault: true }).lean(),
        ]);

        if (defaultOrg && defaultUser) {
          const settings = await this.organizationSettingsService.findOne({
            organization: defaultOrg._id,
          });

          req.context = {
            brandId: undefined,
            hydratedAt: Date.now(),
            isSuperAdmin: true,
            organizationId: String(defaultOrg._id),
            stripeSubscriptionStatus: 'active',
            subscriptionTier: settings?.subscriptionTier || 'free',
            userId: String(defaultUser._id),
          };
        }
      } catch (error: unknown) {
        this.logger.error(
          'Self-hosted context hydration failed',
          error,
          this.context,
        );
      }

      return next();
    }

    const user = req.user;

    if (!user) {
      return next();
    }

    const publicMetadata =
      user.publicMetadata as unknown as IClerkPublicMetadata;
    const clerkId = user.id;
    const userId = publicMetadata.user ?? '';
    const organizationId = publicMetadata.organization ?? '';
    const brandId = publicMetadata.brand ?? undefined;

    if (!userId || !organizationId) {
      return next();
    }

    const cacheKey = buildRcKey(clerkId, organizationId, brandId || undefined);

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
        const keysSetKey = buildRcKeysSetKey(clerkId);
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
}
