import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { isCloudDeployment } from '@genfeedai/config';
import {
  assetResponseIds,
  ingredientResponseIds,
  projectMediaResponse,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { getTenantContext } from '@libs/prisma/tenant-context';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
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
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    return next.handle().pipe(
      mergeMap(async (response: unknown) => {
        const ids = ingredientResponseIds(response);
        // Unauthenticated/public resources never receive an original grant.
        if (!user?.organizationId) {
          return projectMediaResponse(
            response,
            await this.issuer.projectPublicIngredients(ids),
            false,
          );
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
        const [projections, assets] = await Promise.all([
          this.issuer.projectIngredients(scope, ids),
          this.issuer.projectAssets(scope, assetResponseIds(response)),
        ]);
        return projectMediaResponse(response, projections, true, assets);
      }),
    );
  }
}
