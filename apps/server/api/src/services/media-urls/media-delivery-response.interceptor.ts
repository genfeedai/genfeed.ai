import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { isCloudDeployment } from '@genfeedai/config';
import {
  assetResponseIds,
  ingredientResponseIds,
  projectMediaResponse,
  projectSocialAvatarUrls,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { signCdnUrl } from '@libs/media/media-url.util';
import { getTenantContext } from '@libs/prisma/tenant-context';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { mergeMap } from 'rxjs';

/** HTTP adapter for the serializer's typed, record-bound response projection. */
@Injectable()
export class MediaDeliveryResponseInterceptor implements NestInterceptor {
  constructor(
    private readonly issuer: AuthorizedMediaUrlService,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isCloudDeployment() || !this.config.isAuthorizedMediaDeliveryEnabled)
      return next.handle();
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    const isPlatformAdmin = Boolean(user) && getIsSuperAdmin(user, request);
    return next
      .handle()
      .pipe(
        mergeMap(async (response: unknown) =>
          projectSocialAvatarUrls(
            await this.projectMedia(response, user, isPlatformAdmin),
            (url) => signCdnUrl(url, this.config.mediaUrlConfig),
          ),
        ),
      );
  }

  private async projectMedia(
    response: unknown,
    user: AuthenticatedUser | undefined,
    isPlatformAdmin: boolean,
  ): Promise<unknown> {
    const ids = ingredientResponseIds(response);
    // Unauthenticated/public resources never receive an original grant.
    if (!user?.organizationId) {
      const [projections, assets] = await Promise.all([
        this.issuer.projectPublicIngredients(ids),
        this.issuer.projectPublicBrandAssets(assetResponseIds(response)),
      ]);
      return projectMediaResponse(response, projections, false, assets);
    }
    // Authorize against the organization this request is pinned to. A
    // superadmin reading another organization (`?organizationId=`) runs
    // under that tenant, and a read under the session organization would
    // trip the tenant guard. The session's brand belongs to the session
    // organization, so it applies only when the two are the same.
    const organizationId =
      getTenantContext()?.organizationId ?? user.organizationId;
    const scope = {
      brandId:
        organizationId === user.organizationId ? user.brandId : undefined,
      organizationId,
      userId: user.userId || user.id,
    };
    // A platform admin's cross-organization views (admin Library and
    // Generations) list other tenants' assets; those need grants too.
    const [projections, assets] = await Promise.all([
      isPlatformAdmin
        ? this.issuer.projectIngredientsForPlatformAdmin(scope, ids)
        : this.issuer.projectIngredients(scope, ids),
      this.issuer.projectAssets(scope, assetResponseIds(response)),
    ]);
    return projectMediaResponse(response, projections, true, assets);
  }
}
