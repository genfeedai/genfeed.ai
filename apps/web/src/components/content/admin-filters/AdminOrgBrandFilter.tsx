'use client';

import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { useQuery } from '@tanstack/react-query';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { useTranslations } from 'next-intl';
import type { AdminOrgBrandFilterProps } from '@/props/ui/forms/admin-org-brand-filter.props';

/**
 * The organization and brand facets of the admin Filters menu. The brand facet
 * only exists once an organization is picked, because a brand list is one
 * organization's brands. Picking an organization is a single change: the
 * owner clears the brand with it, so this never calls both handlers.
 */
export default function useAdminOrgBrandFacets({
  organization,
  brand,
  onOrganizationChange,
  onBrandChange,
}: AdminOrgBrandFilterProps): FilterMenuFacet[] {
  const translate = useTranslations('ui.filtersButton');
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const {
    data: organizations = [],
    isError: isOrganizationsError,
    isLoading: isOrganizationsLoading,
  } = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const service = await getOrganizationsService();
      // Platform-wide superadmin list. Pages at limit≤100 (BaseQueryDto max)
      // and returns slim { id, label, slug } rows for the picker.
      return service.getAllOrganizations();
    },
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: brands = [],
    isError: isBrandsError,
    isLoading: isBrandsLoading,
  } = useQuery({
    queryKey: ['admin-org-brands', organization],
    queryFn: async () => {
      const service = await getOrganizationsService();
      // One organization's brands fit inside the server's page cap, same as
      // the organizations list above.
      return service.findOrganizationBrands(organization, {
        limit: MAX_PAGE_SIZE,
      });
    },
    enabled: !!organization,
    staleTime: 5 * 60 * 1000,
  });

  const facets: FilterMenuFacet[] = [
    {
      defaultValue: '',
      emptyLabel: isOrganizationsLoading
        ? translate('loading')
        : isOrganizationsError
          ? translate('loadFailed')
          : translate('noOrganizations'),
      key: 'organization',
      label: translate('facets.organization'),
      onChange: onOrganizationChange,
      options:
        organizations.length > 0
          ? [
              { label: translate('allOrganizations'), value: '' },
              ...organizations.map((org) => ({
                icon: (
                  <BrandAvatar
                    name={org.label || org.id}
                    size="xs"
                    src={org.logoUrl ?? undefined}
                  />
                ),
                isLiteral: true,
                label: org.label || org.id,
                value: org.id,
              })),
            ]
          : [],
      searchPlaceholder: translate('searchOrganizations'),
      selection: 'single',
      value: organization,
    },
  ];

  // A brand already in the URL stays visible (and clearable) even without an
  // organization, because it still filters the list.
  if (organization || brand) {
    facets.push({
      defaultValue: '',
      emptyLabel: isBrandsLoading
        ? translate('loading')
        : isBrandsError
          ? translate('loadFailed')
          : translate('noBrands'),
      key: 'adminBrand',
      label: translate('facets.brand'),
      onChange: onBrandChange,
      options:
        brands.length > 0
          ? [
              { label: translate('allBrands'), value: '' },
              ...brands.map((item) => ({
                isLiteral: true,
                label: item.label || item.id,
                value: item.id,
              })),
            ]
          : [],
      searchPlaceholder: translate('searchBrands'),
      selection: 'single',
      value: brand,
    });
  }

  return facets;
}
