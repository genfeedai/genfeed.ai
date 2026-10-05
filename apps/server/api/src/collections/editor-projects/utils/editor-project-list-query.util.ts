import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import type { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { SortObject } from '@genfeedai/contracts/interfaces';

export function buildEditorProjectListAggregate(
  query: BaseQueryDto,
  user: User,
  tenant: ReturnType<typeof CollectionFilterUtil.resolveListOrganizationId>,
) {
  return {
    where: {
      ...((tenant.isOrganizationOverride ? tenant.brandId : user.brandId)
        ? {
            brandId: tenant.isOrganizationOverride
              ? tenant.brandId
              : user.brandId,
          }
        : {}),
      isDeleted: false,
      organizationId: tenant.organizationId,
    },
    orderBy: query.sort
      ? handleQuerySort(query.sort)
      : ({ updatedAt: -1 } as SortObject),
  };
}
