import {
  Brand,
  type BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import {
  Organization,
  type OrganizationDocument,
} from '@api/collections/organizations/schemas/organization.schema';
import {
  type UserDocument,
  User as UserSchema,
} from '@api/collections/users/schemas/user.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import type { User } from '@clerk/backend';
import { IS_HYBRID_MODE, IS_LOCAL_MODE } from '@genfeedai/config';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Request } from 'express';
import type { Model } from 'mongoose';
import type { Observable } from 'rxjs';

interface CachedIdentity {
  defaultBrand: BrandDocument;
  defaultOrg: OrganizationDocument;
  defaultUser: UserDocument;
}

@Injectable()
export class LocalIdentityInterceptor implements NestInterceptor {
  private readonly context = { service: LocalIdentityInterceptor.name };
  private cachedIdentity: CachedIdentity | null = null;

  constructor(
    private readonly logger: LoggerService,
    @InjectModel(Organization.name, DB_CONNECTIONS.AUTH)
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(UserSchema.name, DB_CONNECTIONS.AUTH)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Brand.name, DB_CONNECTIONS.CLOUD)
    private readonly brandModel: Model<BrandDocument>,
  ) {}

  async intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (!IS_LOCAL_MODE && !IS_HYBRID_MODE) {
      return next.handle();
    }

    const request = executionContext.switchToHttp().getRequest<Request>();

    if (request.user) {
      return next.handle();
    }

    try {
      const identity = await this.resolveIdentity();

      if (!identity) {
        return next.handle();
      }

      const { defaultOrg, defaultUser, defaultBrand } = identity;

      request.user = {
        emailAddresses: [],
        firstName: 'Local',
        id: 'local-admin',
        lastName: 'Admin',
        publicMetadata: {
          brand: String(defaultBrand._id),
          isSuperAdmin: true,
          organization: String(defaultOrg._id),
          stripeSubscriptionStatus: 'active',
          subscriptionTier: 'free',
          user: String(defaultUser._id),
        },
      } as unknown as User;
    } catch (error: unknown) {
      this.logger.error('Local identity injection failed', error, this.context);
    }

    return next.handle();
  }

  private async resolveIdentity(): Promise<CachedIdentity | null> {
    if (this.cachedIdentity) {
      return this.cachedIdentity;
    }

    const [defaultOrg, defaultUser, defaultBrand] = await Promise.all([
      this.organizationModel.findOne({ isDefault: true }).lean(),
      this.userModel.findOne({ isDefault: true }).lean(),
      this.brandModel.findOne({ isDefault: true }).lean(),
    ]);

    if (!defaultOrg || !defaultUser || !defaultBrand) {
      this.logger.warn(
        'Default org/user/brand not found — skipping local identity',
        this.context,
      );
      return null;
    }

    this.cachedIdentity = { defaultBrand, defaultOrg, defaultUser };
    return this.cachedIdentity;
  }
}
