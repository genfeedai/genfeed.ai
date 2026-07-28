import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { resolveRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import { AssetScope } from '@genfeedai/enums';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * AssetAccessGuard
 *
 * Checks if a user has permission to access an asset based on its scope:
 * - PUBLIC: Anyone can access
 * - ORGANIZATION: Must be in same organization
 * - BRAND: Must be in same brand
 * - USER: Must be the owner
 *
 * Expects 'ingredientId' parameter in the route.
 *
 * @example
 * ```typescript
 * @Get(':ingredientId')
 * @UseGuards(AssetAccessGuard)
 * async findOne(@Param('ingredientId') ingredientId: string) {
 *   // Guard has already checked access
 *   return this.service.findOne({ _id: ingredientId });
 * }
 * ```
 */
@Injectable()
export class AssetAccessGuard implements CanActivate {
  constructor(private readonly ingredientsService: IngredientsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // From @CurrentUser decorator
    const assetId = request.params.ingredientId || request.params.id;

    if (!assetId) {
      throw new NotFoundException({ message: 'Asset ID not provided' });
    }

    // Find asset (include isDeleted check to avoid accessing soft-deleted assets)
    const asset = await this.ingredientsService.findOne({
      _id: assetId,
      isDeleted: false,
    });

    if (!asset) {
      throw new NotFoundException('Asset');
    }

    const assetScope = asset.scope ?? AssetScope.USER;

    // PUBLIC scope → Everyone can access
    if (assetScope === AssetScope.PUBLIC) {
      return true;
    }

    // Non-public assets require authentication
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Check permissions based on scope
    switch (assetScope) {
      case AssetScope.ORGANIZATION: {
        // Scalar FKs first — Mongo-era aliases type-check but are often undefined
        // on Prisma rows unless the relation was included/back-filled.
        const assetUserId = resolveRelationId(asset.userId, asset.user);

        if (
          assetUserId === user.id ||
          assetUserId === user.publicMetadata?.user
        ) {
          return true;
        }

        const assetOrgId = resolveRelationId(
          asset.organizationId,
          asset.organization,
        );
        const userOrgId = user.publicMetadata?.organization?.toString();

        if (assetOrgId && userOrgId && assetOrgId === userOrgId) {
          return true;
        }

        throw new ForbiddenException(
          'You do not have access to this organization asset',
        );
      }

      case AssetScope.BRAND: {
        const brandAssetUserId = resolveRelationId(asset.userId, asset.user);

        if (
          brandAssetUserId === user.id ||
          brandAssetUserId === user.publicMetadata?.user
        ) {
          return true;
        }

        const assetBrandId = resolveRelationId(asset.brandId, asset.brand);
        const userBrandId = user.publicMetadata?.brand?.toString();

        if (assetBrandId && userBrandId && assetBrandId === userBrandId) {
          return true;
        }

        throw new ForbiddenException(
          'You do not have access to this brand asset',
        );
      }

      case AssetScope.USER: {
        const userAssetUserId = resolveRelationId(asset.userId, asset.user);

        if (
          userAssetUserId === user.id ||
          userAssetUserId === user.publicMetadata?.user
        ) {
          return true;
        }

        throw new ForbiddenException('You do not own this asset');
      }

      default:
        throw new ForbiddenException('Invalid asset scope');
    }
  }
}
