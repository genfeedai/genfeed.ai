import { ASSET_ORIGIN_GENERATION_PENDING } from '@api/collections/assets/constants/asset-origin.constant';
import { PRISMA_ASSET_CATEGORY_BY_ROLE } from '@api/collections/brands/constants/brand-kit-assets.constant';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetParent } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/**
 * Organization logos are `Asset` rows (parentType ORGANIZATION, category LOGO)
 * — there is no logo column on `organizations`. Resolution is batched so the
 * org switcher's whole list costs one query.
 *
 * URLs are signed on every read through `MediaUrlService`, so a private CDN
 * never receives a bare link. A logo that cannot be resolved yields no URL, so
 * the switcher falls back to its initial-letter avatar.
 */
@Injectable()
export class OrganizationLogoService {
  private readonly reportedOrganizationIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUrlService: MediaUrlService,
    private readonly loggerService: LoggerService,
  ) {}

  async resolveLogoUrls(
    organizationIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(organizationIds.filter(Boolean))];
    const logoUrls = new Map<string, string>();

    if (ids.length === 0) {
      return logoUrls;
    }

    const assets = await this.prisma.asset.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { cloudObjectKey: true, id: true, parentOrgId: true },
      where: {
        category: PRISMA_ASSET_CATEGORY_BY_ROLE.logo,
        isDeleted: false,
        // A generated logo whose image is not uploaded yet must never win.
        OR: [
          { origin: null },
          { origin: { not: ASSET_ORIGIN_GENERATION_PENDING } },
        ],
        parentOrgId: { in: ids },
        parentType:
          AssetParent.ORGANIZATION as Prisma.AssetCreateInput['parentType'],
      },
    });

    for (const asset of assets) {
      if (!asset.parentOrgId || logoUrls.has(asset.parentOrgId)) {
        continue;
      }
      const objectKey = asset.cloudObjectKey?.trim() || `logos/${asset.id}`;
      try {
        logoUrls.set(
          asset.parentOrgId,
          this.mediaUrlService.buildUrl(objectKey),
        );
      } catch (error: unknown) {
        this.reportUnresolvedLogo(asset.parentOrgId, asset.id, error);
      }
    }

    return logoUrls;
  }

  private reportUnresolvedLogo(
    organizationId: string,
    assetId: string,
    error: unknown,
  ): void {
    if (this.reportedOrganizationIds.has(organizationId)) {
      return;
    }
    this.reportedOrganizationIds.add(organizationId);

    this.loggerService.warn('Organization logo URL could not be built', {
      assetId,
      error: error instanceof Error ? error.message : String(error),
      organizationId,
    });
    Sentry.captureException(error, {
      extra: { assetId },
      level: 'warning',
      tags: {
        component: 'OrganizationLogoService',
        organizationId,
        reason: 'logo-url-unresolved',
      },
    });
  }
}
