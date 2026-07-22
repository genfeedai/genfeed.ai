import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { parseVoiceProviders } from '@api/collections/voices/utils/voice-provider.util';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { IngredientCategory } from '@genfeedai/enums';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class VoiceLibraryService {
  constructor(private readonly voicesService: VoicesService) {}

  async findAll(
    user: User,
    query: VoicesQueryDto,
  ): Promise<AggregatePaginateResult<IngredientDocument>> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    try {
      const publicMetadata = getPublicMetadata(user);
      const normalizedSearch = query.search?.trim();
      const sort = query.sort || 'metadata.label: 1, createdAt: -1';
      const where: Record<string, unknown> = {
        OR: [{ isCloned: true }, { externalVoiceCatalogId: { not: null } }],
        brandId: publicMetadata.brand,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.VOICE,
        ),
        isDeleted: false,
        organizationId: publicMetadata.organization,
      };

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

      return await this.voicesService.findAll(
        { orderBy: handleQuerySort(sort), where },
        options,
      );
    } catch (_error: unknown) {
      throw new HttpException(
        'Failed to find voices',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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
      const publicMetadata = getPublicMetadata(user);
      return await this.voicesService.findAll(
        {
          orderBy: { createdAt: -1 as const },
          where: {
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.VOICE,
            ),
            isCloned: true,
            isDeleted: false,
            organizationId: publicMetadata.organization,
          },
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
