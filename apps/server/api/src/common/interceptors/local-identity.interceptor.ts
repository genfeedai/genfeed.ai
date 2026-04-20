import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { User } from '@clerk/backend';
import { IS_HYBRID_MODE, IS_LOCAL_MODE } from '@genfeedai/config';
import type {
  Brand,
  Organization,
  User as PrismaUser,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

interface CachedIdentity {
  defaultBrand: Brand;
  defaultOrg: Organization;
  defaultUser: PrismaUser;
}

@Injectable()
export class LocalIdentityInterceptor implements NestInterceptor {
  private readonly context = { service: LocalIdentityInterceptor.name };
  private cachedIdentity: CachedIdentity | null = null;

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
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
          brand: defaultBrand.id,
          isSuperAdmin: true,
          organization: defaultOrg.id,
          stripeSubscriptionStatus: 'active',
          subscriptionTier: 'free',
          user: defaultUser.id,
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
      this.prisma.organization.findFirst({ where: { isDefault: true } }),
      this.prisma.user.findFirst({ where: { isDefault: true } }),
      this.prisma.brand.findFirst({ where: { isDefault: true } }),
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
