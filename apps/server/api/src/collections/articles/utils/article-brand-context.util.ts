import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { traced } from '@libs/tracing/traced';

/**
 * The brand an article call acts in: the caller's active brand unless the call
 * names another one. A named brand must belong to the caller's organization
 * and, for a key limited to some brands, be one of them. An unusable brand
 * reads as not found so a brand id of another organization is never confirmed.
 */
export const resolveArticleBrandContext = traced(
  'resolveArticleBrandContext',
  async (
    prisma: Pick<PrismaService, 'brand'>,
    organizationId: string,
    activeBrandId: string,
    requestedBrandId: string | undefined,
    allowedBrandIds: readonly string[] | undefined,
  ): Promise<string> => {
    if (!requestedBrandId || requestedBrandId === activeBrandId) {
      return activeBrandId;
    }
    if (allowedBrandIds && !allowedBrandIds.includes(requestedBrandId)) {
      throw new NotFoundException('Brand', requestedBrandId);
    }
    const brand = await prisma.brand.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { id: requestedBrandId }),
    });
    if (!brand) {
      throw new NotFoundException('Brand', requestedBrandId);
    }
    return brand.id;
  },
);
