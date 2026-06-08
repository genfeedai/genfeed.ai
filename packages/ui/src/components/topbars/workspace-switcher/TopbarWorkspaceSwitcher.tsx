'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import Image from 'next/image';
import { HiChevronDown, HiOutlineSquares2X2 } from 'react-icons/hi2';
import { useTopbarWorkspaceSwitcher } from './useTopbarWorkspaceSwitcher';
import WorkspaceActionButton from './WorkspaceActionButton';
import WorkspaceSwitcherCreateOrgModal from './WorkspaceSwitcherCreateOrgModal';
import WorkspaceSwitcherSection from './WorkspaceSwitcherSection';

export default function TopbarWorkspaceSwitcher({
  compact = false,
}: {
  compact?: boolean;
} = {}) {
  const {
    logoUrl,
    orgSlug,
    brandId,
    isOpen,
    searchTerm,
    setSearchTerm,
    isBusy,
    organizationLabel,
    organizationsError,
    selectedBrand,
    filteredOrganizations,
    filteredBrands,
    searchInputRef,
    createModalOpen,
    setCreateModalOpen,
    newOrganizationLabel,
    setNewOrganizationLabel,
    newOrganizationDescription,
    setNewOrganizationDescription,
    isCreatingOrganization,
    createOrganizationError,
    handleOrganizationSwitch,
    handleBrandSwitch,
    handleEscAction,
    handleCreateOrganization,
    handleOpenChange,
    handleOpenCreateProject,
    handleOpenNewOrganization,
  } = useTopbarWorkspaceSwitcher();

  return (
    <>
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            ariaLabel="Open projects switcher"
            className={cn(
              'gen-shell-control flex w-full items-center rounded-md text-left',
              compact ? 'h-7 gap-2 px-2.5' : 'h-11 gap-2.5 px-3.5',
              isBusy && 'cursor-not-allowed opacity-60',
            )}
            data-active={isOpen ? 'true' : 'false'}
            isDisabled={isBusy}
          >
            <div
              className={cn(
                'gen-shell-surface flex items-center justify-center overflow-hidden rounded-md',
                compact ? 'size-5' : 'size-7',
              )}
            >
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={EnvironmentService.LOGO_ALT}
                  width={16}
                  height={16}
                  className="size-4 object-contain dark:invert"
                  sizes="16px"
                />
              ) : (
                <span className="text-xs font-semibold text-foreground/90">
                  G
                </span>
              )}
            </div>

            <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold tracking-[-0.01em] text-foreground">
              All Projects
            </span>

            <HiChevronDown
              className={cn(
                'size-3.5 flex-shrink-0 text-foreground/38 transition-transform duration-200',
                isOpen && 'rotate-180',
              )}
            />
          </Button>
        </PopoverTrigger>

        <PopoverPanelContent
          align="start"
          className="w-[420px] rounded-md p-0"
          sideOffset={10}
        >
          <div className="border-b border-foreground/[0.06] p-3">
            <div className="relative">
              <Input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Find Project…"
                className="gen-shell-control h-11 rounded-md border-foreground/[0.06] bg-background/44 pr-14 text-sm placeholder:text-foreground/28"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    handleEscAction();
                  }
                }}
              />
              <Button
                ariaLabel="Run escape action in workspace switcher"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={handleEscAction}
                className="gen-shell-control absolute right-2 top-1/2 -translate-y-1/2 rounded px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-foreground/52"
              >
                Esc
              </Button>
            </div>
          </div>

          <div className="max-h-[30rem] overflow-y-auto p-2.5">
            <WorkspaceSwitcherSection
              emptyMessage={
                organizationsError ?? 'No organizations available right now'
              }
              items={filteredOrganizations.map((organization) => ({
                icon: (
                  <HiOutlineSquares2X2 className="size-4 text-foreground/35" />
                ),
                id: organization.id,
                isActive:
                  organization.isActive &&
                  (!brandId || organization.slug === orgSlug),
                label: organization.label,
                meta: organization.brand?.label ?? 'Organization pages',
              }))}
              title="Organizations"
              onSelect={(organizationId) =>
                void handleOrganizationSwitch(organizationId)
              }
            />

            <WorkspaceSwitcherSection
              emptyMessage="No brands available right now"
              items={filteredBrands.map((brand) => ({
                id: brand.id,
                imageUrl: brand.logoUrl || undefined,
                isActive: brand.id === brandId,
                label: `${brand.label ?? 'Untitled'}${brand.isDarkroomEnabled ? ' · Darkroom' : ''}`,
                meta:
                  brand.id === brandId
                    ? organizationLabel
                    : (selectedBrand?.label ?? 'Brand workspace'),
              }))}
              title="Brands"
              onSelect={(nextBrandId) => void handleBrandSwitch(nextBrandId)}
            />
          </div>

          <div className="border-t border-foreground/[0.06] p-2">
            <WorkspaceActionButton
              label="Create Project"
              onClick={handleOpenCreateProject}
            />
            <WorkspaceActionButton
              label="New Organization"
              onClick={handleOpenNewOrganization}
            />
          </div>
        </PopoverPanelContent>
      </Popover>

      <WorkspaceSwitcherCreateOrgModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        newOrganizationLabel={newOrganizationLabel}
        onLabelChange={setNewOrganizationLabel}
        newOrganizationDescription={newOrganizationDescription}
        onDescriptionChange={setNewOrganizationDescription}
        isCreatingOrganization={isCreatingOrganization}
        createOrganizationError={createOrganizationError}
        onConfirm={() => void handleCreateOrganization()}
      />
    </>
  );
}
