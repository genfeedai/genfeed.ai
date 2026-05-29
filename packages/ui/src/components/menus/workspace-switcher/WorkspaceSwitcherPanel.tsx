'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  HiOutlineBuildingOffice2,
  HiOutlineCog6Tooth,
  HiPlus,
} from 'react-icons/hi2';
import { SectionHeader } from './SectionHeader';
import { SectionRow } from './SectionRow';

type BrandEntry = {
  id: string;
  label: string | null | undefined;
  logoUrl?: string | null;
  isDarkroomEnabled?: boolean;
};

type OrganizationEntry = {
  id: string;
  label: string;
  isActive: boolean;
  brand: { id: string; label: string } | null;
};

type WorkspaceSwitcherPanelProps = {
  organizations: OrganizationEntry[];
  organizationsError: string | null;
  brands: BrandEntry[];
  brandId: string | undefined;
  isSwitchingOrganization: boolean;
  isSwitchingBrand: boolean;
  onSwitchOrganization: (id: string) => void;
  onSwitchBrand: (id: string) => void;
  onOpenOrgSettings: () => void;
  onOpenBrandSettings: () => void;
  onOpenCreateBrand: () => void;
  onOpenCreateOrg: () => void;
};

export function WorkspaceSwitcherPanel({
  organizations,
  organizationsError,
  brands,
  brandId,
  isSwitchingOrganization,
  isSwitchingBrand,
  onSwitchOrganization,
  onSwitchBrand,
  onOpenOrgSettings,
  onOpenBrandSettings,
  onOpenCreateBrand,
  onOpenCreateOrg,
}: WorkspaceSwitcherPanelProps) {
  return (
    <>
      <div className="max-h-80 overflow-y-auto">
        <SectionHeader label="Organization" />
        {organizationsError ? (
          <p className="px-3 py-1.5 text-xs text-red-400">
            {organizationsError}
          </p>
        ) : organizations.length === 0 ? (
          <p className="px-3 py-1.5 text-xs text-white/40">Loading…</p>
        ) : (
          organizations
            .slice()
            .sort((a, b) => a.label.localeCompare(b.label))
            .map((org) => (
              <SectionRow
                key={org.id}
                label={org.label}
                isActive={org.isActive}
                onSelect={() => onSwitchOrganization(org.id)}
                isDisabled={isSwitchingOrganization}
                testId={`workspace-switcher-org-${org.id}`}
              />
            ))
        )}

        {brands.length > 0 ? (
          <>
            <SectionHeader label="Brands" />
            {brands
              .slice()
              .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
              .map((brand) => {
                const label = `${brand.label ?? 'Untitled'}${brand.isDarkroomEnabled ? ' · Darkroom' : ''}`;
                return (
                  <SectionRow
                    key={brand.id}
                    label={label}
                    imageUrl={brand.logoUrl}
                    isActive={brand.id === brandId}
                    onSelect={() => onSwitchBrand(brand.id)}
                    isDisabled={isSwitchingBrand}
                    testId={`workspace-switcher-brand-${brand.id}`}
                  />
                );
              })}
          </>
        ) : null}
      </div>

      <div className="mt-1 border-t border-white/[0.08] pt-1">
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={onOpenOrgSettings}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
        >
          <HiOutlineCog6Tooth className="size-3.5 flex-shrink-0" />
          <span>Organization settings</span>
        </Button>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={onOpenBrandSettings}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
        >
          <HiOutlineCog6Tooth className="size-3.5 flex-shrink-0" />
          <span>Brand settings</span>
        </Button>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={onOpenCreateBrand}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
        >
          <HiPlus className="size-3.5 flex-shrink-0" />
          <span>New brand</span>
        </Button>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={onOpenCreateOrg}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
        >
          <HiOutlineBuildingOffice2 className="size-3.5 flex-shrink-0" />
          <span>New organization</span>
        </Button>
      </div>
    </>
  );
}
