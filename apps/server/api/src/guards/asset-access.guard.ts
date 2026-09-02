import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
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
 * AssetScope is UPPER_SNAKE (`USER`, `BRAND`, `ORGANIZATION`, `PUBLIC`) end to
 * end — Prisma and the app enum share the same labels. Always normalize case
 * before comparing (some callers pass lowercase) or every USER/BRAND/ORG
 * asset falls through to "Invalid asset scope" → 403.
 */
@Injectable()
export class AssetAccessGuard implements CanActivate {
  constructor(private readonly ingredientsService: IngredientsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    const assetId = request.params.ingredientId || request.params.id;

    if (!assetId) {
      throw new NotFoundException({ message: 'Asset ID not provided' });
    }

    // Find asset (include isDeleted check to avoid accessing soft-deleted assets)
    const asset = await this.ingredientsService.findOne({
      id: assetId,
    });

    if (!asset) {
      throw new NotFoundException('Asset');
    }

    const assetScope = normalizeAssetScope(asset.scope);

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
        if (isAssetOwner(asset.userId, user)) {
          return true;
        }

        const assetOrgId = asset.organizationId;
        const userOrgId = user.organizationId;

        if (assetOrgId && userOrgId && assetOrgId === userOrgId) {
          return true;
        }

        throw new ForbiddenException(
          'You do not have access to this organization asset',
        );
      }

      case AssetScope.BRAND: {
        if (isAssetOwner(asset.userId, user)) {
          return true;
        }

        const assetBrandId = asset.brandId;
        const userBrandId = user.brandId;

        if (assetBrandId && userBrandId && assetBrandId === userBrandId) {
          return true;
        }

        throw new ForbiddenException(
          'You do not have access to this brand asset',
        );
      }

      case AssetScope.USER: {
        if (isAssetOwner(asset.userId, user)) {
          return true;
        }

        throw new ForbiddenException('You do not own this asset');
      }

      default:
        throw new ForbiddenException('Invalid asset scope');
    }
  }
}

/**
 * Map any-case scope input (Prisma persists UPPER_SNAKE; some callers still
 * pass lowercase) onto the canonical UPPER_SNAKE `AssetScope` enum.
 */
export function normalizeAssetScope(scope: unknown): AssetScope {
  if (typeof scope !== 'string' || scope.trim().length === 0) {
    return AssetScope.USER;
  }

  const normalized = scope.trim().toUpperCase();
  switch (normalized) {
    case AssetScope.PUBLIC:
      return AssetScope.PUBLIC;
    case AssetScope.ORGANIZATION:
      return AssetScope.ORGANIZATION;
    case AssetScope.BRAND:
      return AssetScope.BRAND;
    case AssetScope.USER:
      return AssetScope.USER;
    default:
      return AssetScope.USER;
  }
}

/**
 * Prefer canonical `identity.userId` (Prisma users.id). JWT `user.id` is
 * claims.sub and may match, but metadata is the durable identity.
 */
function isAssetOwner(
  assetUserId: string | null | undefined,
  user: AuthenticatedUser,
): boolean {
  if (!assetUserId) {
    return false;
  }

  return assetUserId === user.userId || assetUserId === user.id;
}
