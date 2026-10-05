import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import {
  type IngredientCharacterFilterService,
  resolveCharacterFilter,
} from '@api/collections/ingredients/services/ingredient-character-filter.service';
import type { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';

export async function buildImageListAggregate(
  query: ImagesQueryDto,
  user: User,
  tenant: ReturnType<typeof CollectionFilterUtil.resolveListOrganizationId>,
  imageCategory: ReturnType<typeof CategoryPrismaUtil.toIngredientCategory>,
  characterFilterService?: IngredientCharacterFilterService,
) {
  // Handle multiple status values (comma-separated)
  const status = QueryDefaultsUtil.parseStatusFilter(query.status);
  const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

  // Use CollectionFilterUtil for common filtering patterns
  const scope = CollectionFilterUtil.buildScopeFilter(query.scope);
  const brandId = tenant.isOrganizationOverride
    ? tenant.brandId
    : CollectionFilterUtil.buildBrandFilter(query.brandId, user, 'exists');

  // Use IngredientFilterUtil to build ingredient-specific filters
  const parentConditions = IngredientFilterUtil.buildParentFilter(
    query.parentId,
  );

  const folderConditions = IngredientFilterUtil.buildFolderFilter(
    query.folderId,
  );

  const trainingFilter = IngredientFilterUtil.buildTrainingFilter(
    query.trainingId,
  );

  // Origin narrows the whole list, brand-default images included.
  const originFilter = IngredientFilterUtil.buildOriginFilter(query.origins);

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

  // Build isPublic filter for public gallery (getshareable.app)
  const isPublicFilter =
    query.isPublic !== undefined ? { isPublic: query.isPublic } : {};

  return {
    where: {
      AND: [
        {
          OR: [
            {
              AND: [
                {
                  organizationId: tenant.organizationId,
                  category: imageCategory,
                  isDeleted,
                  ...(query.isPublic === undefined && scope !== undefined
                    ? { scope }
                    : {}),
                  ...(brandId ? { brandId } : {}),
                  status,
                  ...isPublicFilter,
                },
                folderConditions,
                trainingFilter,
                ...(Object.keys(parentConditions).length > 0
                  ? [parentConditions]
                  : []),
              ],
            },
            // Default images (only when not filtering by isPublic)
            ...(query.isPublic === undefined
              ? [
                  {
                    AND: [
                      {
                        category: imageCategory,
                        isDefault: true,
                        isDeleted,
                        OR: [
                          {
                            organizationId: tenant.organizationId,
                          },
                          { organizationId: null },
                        ],
                        status,
                        // Filter default images by brand when brand is specified
                        ...(isEntityId(query.brandId) ? { brandId } : {}),
                      },
                      folderConditions,
                      ...(Object.keys(parentConditions).length > 0
                        ? [parentConditions]
                        : []),
                    ],
                  },
                ]
              : []),
          ],
        },
        originFilter,
        characterFilter,
        IngredientFilterUtil.buildTagFilter(query.tags, query.tagMatch),
      ],
    },
    include: IngredientFilterUtil.buildLibraryTagsInclude(),
    orderBy: handleQuerySort(query.sort),
  };
}
