import { projectApprovedBrandIdentitySnapshot } from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import { buildVideoBrandRules } from '@api/services/content-quality/video-brand-rules.util';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  AssetCategory,
  AssetParent,
  BrandOsRevisionStatus,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Traced } from '@libs/tracing/traced';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

/** Rasters a vision model can read; an SVG or other logo format is skipped. */
const VISION_LOGO_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface BrandVideoContext {
  brandName?: string;
  /** Approved palette, logo and video rules as judge input; may be empty. */
  rulesText: string;
  /** Signed URL of the approved raster logo, when the brand has one. */
  logoUrl?: string;
}

/**
 * The brand input a video quality score needs: the approved Brand OS rules
 * that apply to video, and the approved logo as a reference image. Reads only;
 * a brand without an approved Brand OS yields the name alone, and any failure
 * degrades to no brand context rather than failing the score.
 */
@Traced()
@Injectable()
export class BrandVideoContextService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUrlService: MediaUrlService,
    private readonly logger: LoggerService,
  ) {}

  async resolve(
    brandId: string | null | undefined,
    organizationId: string | null | undefined,
  ): Promise<BrandVideoContext | undefined> {
    if (!brandId || !organizationId) {
      return undefined;
    }
    try {
      const brand = await this.prisma.brand.findFirst({
        select: { label: true },
        where: scopedWhere(organizationId, { id: brandId }),
      });
      if (!brand) {
        return undefined;
      }
      const revisions = await this.prisma.brandOsRevision.findMany({
        take: 2,
        where: scopedWhere(organizationId, {
          brandId,
          status: BrandOsRevisionStatus.APPROVED,
        }),
      });
      if (revisions.length !== 1) {
        return { brandName: brand.label, rulesText: '' };
      }
      const snapshot = projectApprovedBrandIdentitySnapshot(
        revisions[0],
        new Date().toISOString(),
      );
      const rules = buildVideoBrandRules(snapshot.generationRules);
      const logoUrl = await this.resolveLogoUrl(
        rules.logoAssetIds,
        organizationId,
        brandId,
      );
      return {
        brandName: brand.label,
        ...(logoUrl ? { logoUrl } : {}),
        rulesText: rules.text,
      };
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} brand video context unavailable: ${getErrorMessage(error)}`,
        { brandId },
      );
      return undefined;
    }
  }

  private async resolveLogoUrl(
    assetIds: readonly string[],
    organizationId: string,
    brandId: string,
  ): Promise<string | undefined> {
    if (assetIds.length === 0) {
      return undefined;
    }
    const logo = await this.prisma.asset.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { cloudObjectKey: true, mimeType: true },
      where: {
        category: AssetCategory.LOGO,
        id: { in: [...assetIds] },
        isDeleted: false,
        parentBrandId: brandId,
        parentOrgId: organizationId,
        parentType: AssetParent.BRAND,
      },
    });
    if (
      !logo?.cloudObjectKey ||
      !logo.mimeType ||
      !VISION_LOGO_MIME_TYPES.has(logo.mimeType)
    ) {
      return undefined;
    }
    return this.mediaUrlService.buildUrl(logo.cloudObjectKey);
  }
}
