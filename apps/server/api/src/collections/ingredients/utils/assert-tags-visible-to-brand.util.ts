import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Refuse tag ids an asset of this brand may not carry (#6011). A brand sees its
 * own tags, organization-wide tags and the legacy default tags (no
 * organization); another brand's tag, another organization's tag and a deleted
 * tag all fail the whole request. An empty list is always fine (it clears).
 */
export async function assertTagsVisibleToBrand(
  prisma: Pick<PrismaService, 'tag'>,
  tagIds: readonly string[],
  scope: { brandId?: string | null; organizationId: string },
): Promise<void> {
  const ids = [...new Set(tagIds)];
  if (ids.length === 0) return;

  const { brandId, organizationId } = scope;
  if (!organizationId) {
    throw new BadRequestException('An organization is required to assign tags');
  }

  const tags = await prisma.tag.findMany({
    select: { id: true },
    where: {
      id: { in: ids },
      isDeleted: false,
      OR: [
        { brandId: null, organizationId },
        { brandId: { in: brandId ? [brandId] : [] }, organizationId },
        { brandId: null, organizationId: null, userId: null },
      ],
    },
  });

  if (tags.length !== ids.length) {
    throw new BadRequestException(
      'Tags must belong to the asset brand or the current organization',
    );
  }
}
