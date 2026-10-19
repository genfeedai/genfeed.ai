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
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { scopedWhere } from '@api/index';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { IngredientCategory } from '@genfeedai/contracts';
import { TenantIsolationError } from '@libs/prisma/tenant-guard';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class VoiceLibraryService {
  constructor(
    private readonly voicesService: VoicesService,
    private readonly externalVoiceCatalogService: ExternalVoiceCatalogService,
  ) {}

  async findAll(
    user: User,
    query: VoicesQueryDto,
    request?: Request,
  ): Promise<AggregatePaginateResult<IngredientDocument>> {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    if (!tenant.organizationId) {
      throw new BadRequestException(
        'An organization is required for this request',
      );
    }
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    try {
      const normalizedSearch = query.search?.trim();
      const sort = query.sort || 'metadata.label: 1, createdAt: -1';
      const where: Record<string, unknown> = scopedWhere(
        tenant.organizationId,
        {
          OR: [
            { isCloned: true },
            { externalVoiceCatalogId: { not: null } },
            { voiceSource: 'imported' },
          ],
          category: CategoryPrismaUtil.toIngredientCategory(
            IngredientCategory.VOICE,
          ),
        },
      );

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

      // Catalogue entries are not the org's default voice, so a default filter
      // applies to the org's own voices only.
      if (query.isDefault !== undefined) {
        return ingredientResult;
      }

      return await this.appendCatalogVoices(ingredientResult, {
        isActive: query.isActive,
        limit: options.limit,
        page: options.page,
        providers: requestedProviders,
        search: normalizedSearch,
      });
    } catch (error: unknown) {
      if (error instanceof TenantIsolationError) {
        throw error;
      }
      throw new HttpException(
        'Failed to find voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * The picker lists the org's own voices (clones, imports) first and the
   * platform catalogue after them, as one paginated list. The catalogue is
   * not an ingredient, so its rows continue where the org's rows end rather
   * than being merged into the ingredient query.
   */
  private async appendCatalogVoices(
    ingredientResult: AggregatePaginateResult<IngredientDocument>,
    params: {
      isActive?: boolean;
      limit: number;
      page: number;
      providers: ReturnType<typeof parseVoiceProviders>;
      search?: string;
    },
  ): Promise<AggregatePaginateResult<IngredientDocument>> {
    const orgDocs = ingredientResult.docs ?? [];
    const orgTotal = ingredientResult.totalDocs ?? 0;
    const page = Math.max(params.page, 1);
    const offset = (page - 1) * params.limit;

    const catalog = await this.externalVoiceCatalogService.findRange({
      isActive: params.isActive,
      providers: params.providers,
      search: params.search,
      skip: Math.max(0, offset - orgTotal),
      take: params.limit - orgDocs.length,
    });

    const docs = [
      ...orgDocs,
      ...catalog.docs.map(
        (voice) => toLibraryVoiceDocument(voice) as IngredientDocument,
      ),
    ];
    const totalDocs = orgTotal + catalog.totalDocs;
    const totalPages = Math.max(1, Math.ceil(totalDocs / params.limit));

    return {
      ...ingredientResult,
      docs,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      limit: params.limit,
      nextPage: page < totalPages ? page + 1 : null,
      page,
      pagingCounter: docs.length === 0 ? 0 : offset + 1,
      prevPage: page > 1 ? page - 1 : null,
      totalDocs,
      totalPages,
    };
  }

  async findCloned(
    user: User,
    query: VoicesQueryDto,
    request?: Request,
  ): Promise<AggregatePaginateResult<IngredientDocument>> {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    if (!tenant.organizationId) {
      throw new BadRequestException(
        'An organization is required for this request',
      );
    }
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    try {
      return await this.voicesService.findAll(
        {
          orderBy: { createdAt: -1 as const },
          where: scopedWhere(tenant.organizationId, {
            ...(tenant.isOrganizationOverride && tenant.brandId
              ? { brandId: tenant.brandId }
              : {}),
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.VOICE,
            ),
            isCloned: true,
          }),
        },
        options,
      );
    } catch (error: unknown) {
      if (error instanceof TenantIsolationError) {
        throw error;
      }
      throw new HttpException(
        'Failed to find cloned voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
