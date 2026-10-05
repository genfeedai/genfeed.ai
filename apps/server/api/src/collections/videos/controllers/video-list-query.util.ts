import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  type IngredientCharacterFilterService,
  resolveCharacterFilter,
} from '@api/collections/ingredients/services/ingredient-character-filter.service';
import type { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { IngredientCategory } from '@genfeedai/contracts';

export async function buildVideoListAggregate(
  query: VideosQueryDto,
  user: User,
  tenant: ReturnType<typeof CollectionFilterUtil.resolveListOrganizationId>,
  characterFilterService?: IngredientCharacterFilterService,
) {
  // Handle multiple status values (comma-separated)
  const status = QueryDefaultsUtil.parseStatusFilter(query.status);

  //  KEEP COMMENTS FOR NOW
  const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

  // Use CollectionFilterUtil for common filtering patterns
  const scope = CollectionFilterUtil.buildScopeFilter(query.scope);
  const brandId = tenant.isOrganizationOverride
    ? tenant.brandId
    : CollectionFilterUtil.buildBrandFilter(query.brandId, user, 'user');

  // Use IngredientFilterUtil to build ingredient-specific filters
  const folderConditions = IngredientFilterUtil.buildFolderFilter(
    query.folderId?.toString(),
  );

  const parentConditions = IngredientFilterUtil.buildParentFilter(
    query.parentId?.toString(),
  );

  const trainingFilter = IngredientFilterUtil.buildTrainingFilter(
    query.trainingId?.toString(),
  );
  const searchFilter = CollectionFilterUtil.buildSearchFilter(query.search, [
    'metadata.label',
    'metadata.description',
    'prompt.prompt',
  ]);

  // Handle format filter based on metadata dimensions
  // Format is now filtered after metadata lookup

  const characterFilter = await resolveCharacterFilter(characterFilterService, {
    characterIds: query.characters,
    user: tenant.isOrganizationOverride
      ? {
          ...user,
          organizationId: tenant.organizationId,
          brandId: tenant.brandId ?? '',
        }
      : user,
  });

  return {
    where: {
      AND: [
        { organizationId: tenant.organizationId },
        {
          ...(brandId ? { brandId } : {}),
          category: CategoryPrismaUtil.toIngredientCategory(
            IngredientCategory.VIDEO,
          ),
          isDeleted,
          ...(scope !== undefined ? { scope } : {}),
          status,
          // ...(isEntityId(query.references)
          //   ? { references: query.references }
          //   : {}),
        },
        folderConditions,
        parentConditions,
        trainingFilter,
        IngredientFilterUtil.buildOriginFilter(query.origins),
        characterFilter,
        IngredientFilterUtil.buildTagFilter(query.tags, query.tagMatch),
        searchFilter.where,
      ],
    },
    include: IngredientFilterUtil.buildLibraryTagsInclude(),
    orderBy: handleQuerySort(query.sort),
  };
}
