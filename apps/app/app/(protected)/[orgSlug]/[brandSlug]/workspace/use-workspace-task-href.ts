import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { createBrandAppRoute } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { Task } from '@services/management/tasks.service';
import { useCallback } from 'react';

/** Task actions follow their owner, including on organization-wide lists. */
export function useWorkspaceTaskHref() {
  const { brands } = useBrand();
  const { orgHref, orgSlug } = useOrgUrl();

  return useCallback(
    (task: Task | null, path: string) => {
      const ownerBrand = task?.brandId
        ? brands.find(
            (brand) =>
              getBrandEntityId(brand) === task.brandId &&
              getBrandOrganizationId(brand) === task.organizationId,
          )
        : undefined;

      return ownerBrand?.slug
        ? createBrandAppRoute(
            getBrandOrganizationSlug(ownerBrand) || orgSlug,
            ownerBrand.slug,
            path,
          )
        : orgHref(path);
    },
    [brands, orgHref, orgSlug],
  );
}
