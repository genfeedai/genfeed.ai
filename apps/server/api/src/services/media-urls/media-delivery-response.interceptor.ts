import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { isCloudDeployment } from '@genfeedai/config';
import {
  assetResponseIds,
  ingredientResponseIds,
  projectMediaResponse,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
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
        const scope = {
          brandId: user.brandId,
          organizationId: user.organizationId,
          userId: user.userId || user.id,
        };
        const [projections, hasCleanAccess, assets] = await Promise.all([
          this.issuer.projectIngredients(scope, ids),
          this.issuer.hasCleanAccess(scope.organizationId),
          this.issuer.projectAssets(scope, assetResponseIds(response)),
        ]);
        return projectMediaResponse(
          response,
          projections,
          hasCleanAccess,
          assets,
        );
      }),
    );
  }
}
