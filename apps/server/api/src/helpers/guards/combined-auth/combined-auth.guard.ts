import { REQUIRES_CLOUD_AUTH_KEY } from '@api/helpers/decorators/requires-cloud-auth.decorator';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { User } from '@clerk/backend';
import { IS_HYBRID_MODE, IS_LOCAL_MODE } from '@genfeedai/config';
import type {
  Brand,
  Organization,
  User as PrismaUser,
} from '@genfeedai/prisma';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

/**
 * Combined authentication guard that supports both Clerk JWT and API keys.
 * Used as the global APP_GUARD.
 *
 * Order of checks:
 *  1. @Public() routes → allow immediately
 *  2. LOCAL mode → allow and inject local identity for downstream guards/controllers
 *  3. HYBRID mode → opportunistic auth:
 *     - Has token? → validate (Clerk or API key)
 *     - No token? → allow and inject local identity
 *     - @RequiresCloudAuth() routes → require valid token
 *  4. CLOUD mode → require auth (Clerk or API key)
 */
interface CachedIdentity {
  defaultBrand: Brand;
  defaultOrg: Organization;
  defaultUser: PrismaUser;
}

@Injectable()
export class CombinedAuthGuard implements CanActivate {
  private readonly context = { service: CombinedAuthGuard.name };
  private cachedIdentity: CachedIdentity | null = null;

  constructor(
    private reflector: Reflector,
    private clerkGuard: ClerkGuard,
    private apiKeyAuthGuard: ApiKeyAuthGuard,
    private prisma: PrismaService,
    private logger: LoggerService,
  ) {}

  private async injectLocalIdentity(request: { user?: User }): Promise<void> {
    if (request.user) {
      return;
    }

    try {
      const identity = await this.resolveLocalIdentity();

      if (!identity) {
        return;
      }

      const { defaultBrand, defaultOrg, defaultUser } = identity;

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
  }

  private async resolveLocalIdentity(): Promise<CachedIdentity | null> {
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

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private requiresCloudAuth(context: ExecutionContext): boolean {
    return (
      this.reflector?.getAllAndOverride<boolean>(REQUIRES_CLOUD_AUTH_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private async resolveGuardResult(
    result: boolean | Observable<boolean>,
  ): Promise<boolean> {
    if (result instanceof Observable) {
      return (await result.toPromise()) ?? false;
    }

    return result;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Public routes bypass all auth
    if (this.isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: User;
    }>();

    // 2. LOCAL mode: skip all auth and inject a default local identity
    if (IS_LOCAL_MODE) {
      if (this.requiresCloudAuth(context)) {
        throw new UnauthorizedException(
          'This endpoint requires a cloud connection',
        );
      }
      await this.injectLocalIdentity(request);
      return true;
    }

    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];

    // 3. HYBRID mode: opportunistic auth
    if (IS_HYBRID_MODE) {
      // @RequiresCloudAuth() routes must have a valid token
      if (this.requiresCloudAuth(context) && !token) {
        throw new UnauthorizedException(
          'This endpoint requires a cloud connection',
        );
      }

      // No token? Allow through with a local identity for downstream guards/controllers
      if (!token) {
        await this.injectLocalIdentity(request);
        return true;
      }

      // Has token — validate it
      if (token.startsWith('gf_')) {
        return this.apiKeyAuthGuard.canActivate(context);
      }

      const result = await this.clerkGuard.canActivate(context);
      return this.resolveGuardResult(result);
    }

    // 4. CLOUD mode: require auth
    if (token?.startsWith('gf_')) {
      return this.apiKeyAuthGuard.canActivate(context);
    }

    const result = await this.clerkGuard.canActivate(context);
    return this.resolveGuardResult(result);
  }
}
