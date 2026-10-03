import { PRISMA_ASSET_CATEGORY_BY_ROLE } from '@api/collections/brands/constants/brand-kit-assets.constant';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetParent } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';

/**
 * Organization logos are `Asset` rows (parentType ORGANIZATION, category LOGO)
 * — there is no logo column on `organizations`. Resolution is batched so the
 * org switcher's whole list costs one query.
 */
@Injectable()
export class OrganizationLogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
        parentOrgId: { in: ids },
        parentType:
          AssetParent.ORGANIZATION as Prisma.AssetCreateInput['parentType'],
      },
    });

    const cdnBase = this.configService.cdnUrl.replace(/\/+$/, '');
    for (const asset of assets) {
      if (!asset.parentOrgId || logoUrls.has(asset.parentOrgId)) {
        continue;
      }
      const objectKey = asset.cloudObjectKey?.trim() || `logos/${asset.id}`;
      logoUrls.set(
        asset.parentOrgId,
        `${cdnBase}/${objectKey.replace(/^\/+/, '')}`,
      );
    }

    return logoUrls;
  }
}
