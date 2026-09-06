import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { KnowledgeMemoryScope } from '@genfeedai/contracts';
import type {
  KnowledgeRetrievalFilters,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

/**
 * Turns a user's explicit source/space selection into retrieval filters.
 * Spaces expand to their live member sources inside the same organization and
 * brand; a selection that names nothing the brand can see yields an empty
 * source list, so retrieval returns nothing rather than falling back to all.
 */
@Injectable()
export class KnowledgeSelectionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    organizationId: string,
    brandId: string | undefined,
    selection: KnowledgeSelection | undefined,
  ): Promise<KnowledgeRetrievalFilters | undefined> {
    if (!selection) {
      return undefined;
    }
    const hasSources = Boolean(selection.sourceIds?.length);
    const hasSpaces = Boolean(selection.spaceIds?.length);
    const hasPurposes = Boolean(selection.purposes?.length);
    if (!hasSources && !hasSpaces && !hasPurposes) {
      return undefined;
    }
    const sourceIds = new Set(selection.sourceIds ?? []);
    if (hasSpaces) {
      const memberships = await this.prisma.knowledgeSpaceMembership.findMany({
        select: { sourceId: true },
        where: scopedWhere(organizationId, {
          spaceId: { in: selection.spaceIds ?? [] },
          space: {
            is: {
              isDeleted: false,
              OR: [
                { scope: KnowledgeMemoryScope.ORG, brandId: null },
                ...(brandId
                  ? [{ scope: KnowledgeMemoryScope.BRAND, brandId }]
                  : []),
              ],
            },
          },
        }),
      });
      for (const membership of memberships) {
        sourceIds.add(membership.sourceId);
      }
    }
    return {
      ...(hasSources || hasSpaces
        ? { knowledgeSourceIds: [...sourceIds] }
        : {}),
      ...(hasPurposes ? { knowledgePurposes: selection.purposes } : {}),
    };
  }
}
