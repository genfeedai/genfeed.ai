import type { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import { traced } from '@libs/tracing/traced';
import { ConflictException, HttpException } from '@nestjs/common';

/** Unauthorised, forbidden and not found: the caller may not see this brand. */
const ACCESS_FAILURE_STATUSES = new Set([401, 403, 404]);

/** The brand has no approved identity to take assets from; not an error to render. */
const IDENTITY_UNAVAILABLE_CODES = new Set([
  'brand_identity_unavailable',
  'brand_identity_integrity_failed',
  'brand_identity_asset_unavailable',
]);

export interface BrandRenderSnapshotScope {
  organizationId: string;
  brandId: string;
  /** The actor whose access to the brand is checked. */
  userId: string;
}

/**
 * The approved Brand OS snapshot a render stages brand assets from, or null when
 * the brand has none. An access failure keeps failing; a brand without an
 * approved identity simply renders without brand assets.
 */
export const resolveApprovedRenderSnapshot = traced(
  'resolveApprovedRenderSnapshot',
  async (
    snapshots: Pick<BrandIdentitySnapshotService, 'preview'>,
    logger: Pick<LoggerService, 'warn'>,
    scope: BrandRenderSnapshotScope,
    purpose: string,
  ): Promise<BrandIdentitySnapshotV1 | null> => {
    try {
      return await snapshots.preview({
        actorId: scope.userId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
      });
    } catch (error) {
      if (
        error instanceof HttpException &&
        ACCESS_FAILURE_STATUSES.has(error.getStatus())
      )
        throw error;
      const isKnown =
        error instanceof ConflictException &&
        IDENTITY_UNAVAILABLE_CODES.has(error.message);
      if (!isKnown)
        logger.warn(`Brand snapshot lookup failed for ${purpose}`, {
          brandId: scope.brandId,
          organizationId: scope.organizationId,
          reason: error instanceof Error ? error.name : 'unknown',
        });
      return null;
    }
  },
);
