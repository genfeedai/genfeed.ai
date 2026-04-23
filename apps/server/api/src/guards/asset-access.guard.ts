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
        const assetUserClerkId = this.getRefClerkId(asset.user);
        const assetUserObjectId = this.getRefId(asset.user);

        if (
          assetUserClerkId === user.id ||
          assetUserObjectId === user.publicMetadata?.user
        ) {
          return true;
        }

        // Then check organization membership
        // asset.organization can be either a populated Organization object or just an ObjectId
        const assetOrgId = this.getRefId(asset.organization);
        const userOrgId = user.publicMetadata?.organization?.toString();

        if (assetOrgId && userOrgId && assetOrgId === userOrgId) {
          return true;
        }

        throw new ForbiddenException(
          'You do not have access to this organization asset',
        );
      }

      case AssetScope.BRAND: {
        const brandAssetUserClerkId = this.getRefClerkId(asset.user);
        const brandAssetUserObjectId = this.getRefId(asset.user);

        if (
          brandAssetUserClerkId === user.id ||
          brandAssetUserObjectId === user.publicMetadata?.user
        ) {
          return true;
        }

        // Then check brand membership
        // asset.brand can be either a populated Brand object or just an ObjectId
        const assetBrandId = this.getRefId(asset.brand);
        const userBrandId = user.publicMetadata?.brand?.toString();

        if (assetBrandId && userBrandId && assetBrandId === userBrandId) {
          return true;
        }

        throw new ForbiddenException(
          'You do not have access to this brand asset',
        );
      }

      case AssetScope.USER: {
        const userAssetUserClerkId = this.getRefClerkId(asset.user);
        const userAssetUserObjectId = this.getRefId(asset.user);

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

  private getRefId(
    ref: string | { _id?: string; id?: string } | null | undefined,
  ): string | undefined {
    if (typeof ref === 'string') {
      return ref;
    }

    return ref?._id?.toString() ?? ref?.id?.toString();
  }

  private getRefClerkId(
    ref: string | { clerkId?: string | null } | null | undefined,
  ): string | undefined {
    if (typeof ref === 'string') {
      return undefined;
    }

    return ref?.clerkId ?? undefined;
  }
}
