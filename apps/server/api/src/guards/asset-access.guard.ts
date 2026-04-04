import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetScope } from '@genfeedai/enums';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
      throw new NotFoundException('Asset ID not provided');
    }

    // Find asset (include isDeleted check to avoid accessing soft-deleted assets)
    const asset = await this.ingredientsService.findOne({
      _id: assetId,
      isDeleted: false,
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // PUBLIC scope → Everyone can access
    if (asset.scope === AssetScope.PUBLIC) {
      return true;
    }

    // Non-public assets require authentication
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Check permissions based on scope
    switch (asset.scope) {
      case AssetScope.ORGANIZATION: {
        // First check if user is the owner (creator has full access)
        // asset.user can be either a populated User object or just an ObjectId
        const assetUserClerkId =
          typeof asset.user === 'object' &&
          'clerkId' in asset.user &&
          asset.user?.clerkId
            ? asset.user.clerkId
            : null;

        const assetUserObjectId =
          asset.user?._id?.toString() || asset.user?.toString();

        if (
          assetUserClerkId === user.id ||
          assetUserObjectId === user.publicMetadata?.user
        ) {
          return true;
        }

        // Then check organization membership
        // asset.organization can be either a populated Organization object or just an ObjectId
        const assetOrgId =
          typeof asset.organization === 'object' && asset.organization?._id
            ? asset.organization._id.toString()
            : asset.organization?.toString();
        const userOrgId = user.publicMetadata?.organization?.toString();

        if (assetOrgId && userOrgId && assetOrgId === userOrgId) {
          return true;
        }

        throw new ForbiddenException(
          'You do not have access to this organization asset',
        );
      }

      case AssetScope.BRAND: {
        // First check if user is the owner (creator has full access)
        // asset.user can be either a populated User object or just an ObjectId
        const brandAssetUserClerkId =
          typeof asset.user === 'object' &&
          'clerkId' in asset.user &&
          asset.user?.clerkId
            ? asset.user.clerkId
            : null;
        const brandAssetUserObjectId =
          asset.user?._id?.toString() || asset.user?.toString();

        if (
          brandAssetUserClerkId === user.id ||
          brandAssetUserObjectId === user.publicMetadata?.user
        ) {
          return true;
        }

        // Then check brand membership
        // asset.brand can be either a populated Brand object or just an ObjectId
        const assetBrandId =
          typeof asset.brand === 'object' && asset.brand?._id
            ? asset.brand._id.toString()
            : asset.brand?.toString();
        const userBrandId = user.publicMetadata?.brand?.toString();

        if (assetBrandId && userBrandId && assetBrandId === userBrandId) {
          return true;
        }

        throw new ForbiddenException(
          'You do not have access to this brand asset',
        );
      }

      case AssetScope.USER: {
        // asset.user can be either a populated User object or just an ObjectId
        const userAssetUserClerkId =
          typeof asset.user === 'object' &&
          'clerkId' in asset.user &&
          asset.user?.clerkId
            ? asset.user.clerkId
            : null;

        const userAssetUserObjectId =
          asset.user?._id?.toString() || asset.user?.toString();

        if (
          userAssetUserClerkId === user.id ||
          userAssetUserObjectId === user.publicMetadata?.user
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
