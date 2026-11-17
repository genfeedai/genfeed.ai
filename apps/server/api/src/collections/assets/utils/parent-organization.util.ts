import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AssetParent } from '@genfeedai/contracts';
import { traced } from '@libs/tracing/traced';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * A logo or banner may only be attached to a parent in the caller's own
 * organization. Returns that organization so the asset is stamped with it
 * (`parentOrgId`), which org-scoped readers such as the brand kit require.
 */
export const resolveParentOrganizationId = traced(
  'resolveParentOrganizationId',
  async (
    prisma: PrismaService,
    user: User,
    parentType: AssetParent,
    parentId: string,
  ): Promise<string> => {
    const organizationId = user.organizationId;

    if (!organizationId || !isEntityId(organizationId)) {
      throw new ForbiddenException('Organization not found in session');
    }

    if (parentType === AssetParent.ORGANIZATION) {
      if (parentId !== organizationId) {
        throw new ForbiddenException('Access denied to this organization');
      }
      return organizationId;
    }

    if (parentType === AssetParent.BRAND) {
      const brand = await prisma.brand.findFirst({
        select: { id: true },
        where: { id: parentId, isDeleted: false, organizationId },
      });
      if (!brand) {
        return returnNotFound('Brand', parentId);
      }
      return organizationId;
    }

    throw new BadRequestException('Unsupported asset parent');
  },
);
