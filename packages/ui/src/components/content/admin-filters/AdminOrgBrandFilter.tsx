'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type {
  AdminOrgBrandFilterProps,
  AdminScopeFilterProps,
} from '@genfeedai/props/ui/forms/admin-org-brand-filter.props';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { useQuery } from '@tanstack/react-query';
import SwitcherDropdown from '@ui/menus/switcher-dropdown/SwitcherDropdown';
import {
  SWITCHER_CHEVRON_CLASSNAME,
  SWITCHER_TRIGGER_OPEN_CLASSNAME,
} from '@ui/menus/switchers/switcher-trigger.classes';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { Building2, ChevronsUpDown } from 'lucide-react';

export default function AdminOrgBrandFilter({
  organization,
  brand,
  onOrganizationChange,
  onBrandChange,
}: AdminOrgBrandFilterProps) {
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const { data: organizations = [], isLoading: isLoadingOrganizations } =
    useQuery({
      queryKey: ['admin-organizations'],
      queryFn: async () => {
        const service = await getOrganizationsService();
        // Platform-wide superadmin list. Pages at limit≤100 (BaseQueryDto max)
        // and returns slim { id, label, slug } rows for the picker.
        return service.getAllOrganizations();
      },
      staleTime: 5 * 60 * 1000,
    });

  const { data: brands = [], isLoading: isLoadingBrands } = useQuery({
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

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <AdminScopeFilter
        label="All organizations"
        value={organization}
        isLoading={isLoadingOrganizations}
        options={organizations.map((org) => ({
          id: org.id,
          label: org.label || org.id,
          logoUrl: org.logoUrl,
        }))}
        onChange={onOrganizationChange}
      />
      {organization ? (
        <AdminScopeFilter
          label="All brands"
          value={brand}
          isLoading={isLoadingBrands}
          options={brands.map((item) => ({
            id: item.id,
            label: item.label || item.id,
          }))}
          onChange={onBrandChange}
        />
      ) : null}
    </div>
  );
}

function AdminScopeFilter({
  label,
  value,
  isLoading,
  options,
  onChange,
}: AdminScopeFilterProps) {
  const selected = options.find((option) => option.id === value);
  const displayLabel = selected?.label ?? label;
  return (
    <SwitcherDropdown
      hasSearch
      isLoading={isLoading}
      minWidth={240}
      searchPlaceholder={`Search ${label.replace('All ', '')}…`}
      items={[
        { id: '__all__', label, isActive: !value },
        ...options.map((option) => ({
          id: option.id,
          label: option.label,
          imageUrl: option.logoUrl || undefined,
          isActive: option.id === value,
        })),
      ]}
      onSelect={(id) => onChange(id === '__all__' ? '' : id)}
      renderTrigger={({ isOpen }) => (
        <Button
          ariaLabel={`${label.replace('All ', 'Filter by ')}: ${displayLabel}`}
          className={cn(
            'h-8 min-w-0 max-w-48 gap-2 px-2.5 text-xs',
            isOpen && SWITCHER_TRIGGER_OPEN_CLASSNAME,
          )}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {selected ? (
            <Avatar className="size-5 shrink-0 rounded-sm">
              <AvatarImage alt="" src={selected.logoUrl || undefined} />
              <AvatarFallback className="rounded-sm text-2xs">
                {selected.label.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <Building2 className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown
            aria-hidden="true"
            className={SWITCHER_CHEVRON_CLASSNAME}
          />
        </Button>
      )}
    />
  );
}
