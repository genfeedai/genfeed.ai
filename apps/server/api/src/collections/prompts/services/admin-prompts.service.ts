import {
  ADMIN_GENERATION_CATEGORIES,
  ADMIN_GENERATION_STATUSES,
} from '@api/collections/ingredients/utils/admin-generation-reviews.util';
import type { AdminPromptsQueryDto } from '@api/collections/prompts/dto/admin-prompts-query.dto';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { Prisma } from '@genfeedai/prisma';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Injectable } from '@nestjs/common';

export function buildAdminPromptsWhere(
  query: AdminPromptsQueryDto,
): Prisma.PromptWhereInput {
  const search = query.search?.trim();

  return {
    // Exclude exactly the prompts the generation ledger shows.
    ingredients: {
      none: {
        category: { in: [...ADMIN_GENERATION_CATEGORIES] },
        isDeleted: false,
        status: { in: [...ADMIN_GENERATION_STATUSES] },
      },
    },
    isDeleted: false,
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.brandId ? { brandId: query.brandId } : {}),
    ...(search
      ? {
          OR: [
            { original: { contains: search, mode: 'insensitive' } },
            { enhanced: { contains: search, mode: 'insensitive' } },
            {
              user: {
                is: { email: { contains: search, mode: 'insensitive' } },
              },
            },
          ],
        }
      : {}),
  };
}

/**
 * Superadmin cross-tenant view of prompts that never produced a generation.
 * `GET /prompts` is scoped to the caller's own user, so it cannot show these.
 */
@Injectable()
export class AdminPromptsService {
  constructor(private readonly promptsService: PromptsService) {}

  withoutGeneration(query: AdminPromptsQueryDto) {
    return crossOrgUnsafe(
      async () =>
        // tenant-scope-ignore: superadmin prompt ledger is a read-only cross-tenant view of prompts with no generation
        await this.promptsService.findAll(
          {
            include: {
              organization: { select: { id: true, label: true } },
              user: { select: { email: true, handle: true, id: true } },
            },
            orderBy: handleQuerySort(query.sort),
            where: buildAdminPromptsWhere(query),
          },
          {
            customLabels,
            ...QueryDefaultsUtil.getPaginationDefaults(query),
          },
        ),
    );
  }
}
