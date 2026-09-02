import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import {
  parseVoiceProviders,
  toLibraryVoiceDocument,
} from '@api/collections/voices/utils/voice-provider.util';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { scopedWhere } from '@api/index';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { IngredientCategory, VoiceProvider } from '@genfeedai/contracts';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class VoiceLibraryService {
  constructor(
    private readonly voicesService: VoicesService,
    private readonly externalVoiceCatalogService: ExternalVoiceCatalogService,
  ) {}

  async findAll(
    user: User,
    query: VoicesQueryDto,
  ): Promise<AggregatePaginateResult<IngredientDocument>> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    try {
      const normalizedSearch = query.search?.trim();
      const sort = query.sort || 'metadata.label: 1, createdAt: -1';
      const where: Record<string, unknown> = scopedWhere(user.organizationId, {
        OR: [{ isCloned: true }, { externalVoiceCatalogId: { not: null } }],
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VOICE,
        ),
      });

      if (query.isDefault !== undefined) {
        where.isDefault = Boolean(query.isDefault);
      }

      if (query.isActive !== undefined) {
        where.isVoiceActive = query.isActive ? { not: false } : false;
      }

      const requestedProviders = parseVoiceProviders(query.providers);
      if (requestedProviders.length > 0) {
        where.voiceProvider = { in: requestedProviders };
      }

      if (normalizedSearch) {
        where.AND = [
          {
            OR: [
              {
                label: { contains: normalizedSearch, mode: 'insensitive' },
              },
              {
                externalVoiceId: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
              {
                voiceProvider: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
            ],
          },
        ];
      }

      const ingredientResult = await this.voicesService.findAll(
        { orderBy: handleQuerySort(sort), where },
        options,
      );

      if ((ingredientResult.docs?.length ?? 0) > 0) {
        return ingredientResult;
      }

      return this.paginateCatalogVoices({
        isActive: query.isActive,
        limit: options.limit,
        page: options.page,
        providers: requestedProviders,
        search: normalizedSearch,
      });
    } catch (_error: unknown) {
      throw new HttpException(
        'Failed to find voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async paginateCatalogVoices(params: {
    isActive?: boolean;
    limit: number;
    page: number;
    providers: ReturnType<typeof parseVoiceProviders>;
    search?: string;
  }): Promise<AggregatePaginateResult<IngredientDocument>> {
    const catalog = await this.externalVoiceCatalogService.findAll({
      isActive: params.isActive,
      search: params.search,
    });
    const allowedProviders = new Set<VoiceProvider>(params.providers);
    const docs = catalog
      .map((voice) => toLibraryVoiceDocument(voice))
      .filter((voice) => {
        if (allowedProviders.size === 0) {
          return true;
        }

        return (
          typeof voice.provider === 'string' &&
          allowedProviders.has(voice.provider as VoiceProvider)
        );
      })
      .map((voice) => voice as IngredientDocument);

    const totalDocs = docs.length;
    const totalPages = Math.max(1, Math.ceil(totalDocs / params.limit) || 1);
    const page = Math.min(Math.max(params.page, 1), totalPages);
    const start = (page - 1) * params.limit;
    const pageDocs = docs.slice(start, start + params.limit);

    return {
      docs: pageDocs,
      hasNextPage: page < totalPages && totalDocs > 0,
      hasPrevPage: page > 1,
      limit: params.limit,
      nextPage: page < totalPages ? page + 1 : null,
      page,
      pagingCounter: totalDocs === 0 ? 0 : start + 1,
      prevPage: page > 1 ? page - 1 : null,
      totalDocs,
      totalPages,
    };
  }

  async findCloned(
    user: User,
    query: VoicesQueryDto,
  ): Promise<AggregatePaginateResult<IngredientDocument>> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    try {
      return await this.voicesService.findAll(
        {
          orderBy: { createdAt: -1 as const },
          where: scopedWhere(user.organizationId, {
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.VOICE,
            ),
            isCloned: true,
          }),
        },
        options,
      );
    } catch (_error: unknown) {
      throw new HttpException(
        'Failed to find cloned voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
