'use client';

import { useUser } from '@clerk/nextjs';
import { useBrandOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { Modal } from '@ui/modals/compound/modal.compound';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Textarea } from '@ui/primitives/textarea';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiCheck,
  HiChevronDown,
  HiOutlineBuildingOffice2,
  HiOutlineCog6Tooth,
  HiPlus,
} from 'react-icons/hi2';

type OrganizationEntry = {
  id: string;
  label: string;
  isActive: boolean;
  brand: { id: string; label: string } | null;
};

function Avatar({
  label,
  imageUrl,
  isActive,
}: {
  label: string;
  imageUrl?: string | null;
  isActive?: boolean;
}) {
  if (imageUrl) {
    return (
      <div className="flex size-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-background">
        <Image
          src={imageUrl}
          alt={label}
          width={20}
          height={20}
          className="object-cover object-center"
          sizes="20px"
          style={{ height: 'auto', width: 'auto' }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex size-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold',
        isActive ? 'bg-primary/30 text-primary' : 'bg-white/10 text-white/60',
      )}
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}

function SectionRow({
  label,
  imageUrl,
  isActive,
  onSelect,
  testId,
  isDisabled,
}: {
  label: string;
  imageUrl?: string | null;
  isActive?: boolean;
  onSelect: () => void;
  testId?: string;
  isDisabled?: boolean;
}) {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      data-testid={testId}
      onClick={() => !isActive && onSelect()}
      isDisabled={isActive || isDisabled}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors duration-150',
        isActive
          ? 'text-white cursor-default'
          : 'text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer',
      )}
    >
      <Avatar label={label} imageUrl={imageUrl} isActive={isActive} />
      <span className="flex-1 truncate text-left">{label}</span>
      {isActive && <HiCheck className="size-3.5 text-primary flex-shrink-0" />}
    </Button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pb-1 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">
        {label}
      </span>
    </div>
  );
}

export default function WorkspaceSwitcher() {
  const { user } = useUser();
  const { brands, brandId } = useBrand();
  const { openBrandOverlay } = useBrandOverlay();
  const { push, refresh } = useRouter();
  const { href, orgSlug, orgHref } = useOrgUrl();

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationEntry[]>([]);
  const [organizationsError, setOrganizationsError] = useState<string | null>(
    null,
  );
  const [isSwitchingOrganization, setIsSwitchingOrganization] = useState(false);
  const [isSwitchingBrand, setIsSwitchingBrand] = useState(false);

  const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);
  const [newOrgLabel, setNewOrgLabel] = useState('');
  const [newOrgDescription, setNewOrgDescription] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const service = await getOrganizationsService();
        const data = await service.getMyOrganizations();
        if (!cancelled) {
          setOrganizations(data);
          setOrganizationsError(null);
        }
      } catch {
        if (!cancelled) {
          setOrganizationsError('Failed to load organizations');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getOrganizationsService]);

  const activeOrganization = useMemo(
    () => organizations.find((o) => o.isActive),
    [organizations],
  );
  const selectedBrand = useMemo(
    () => brands.find((b) => b.id === brandId),
    [brands, brandId],
  );

  const triggerLabel =
    selectedBrand?.label ?? activeOrganization?.label ?? 'Workspace';
  const triggerSubLabel =
    selectedBrand && activeOrganization?.label
      ? activeOrganization.label
      : null;
  const triggerImage = selectedBrand?.logoUrl || undefined;

  const handleSwitchOrganization = useCallback(
    async (organizationId: string) => {
      if (isSwitchingOrganization) {
        return;
      }
      setIsSwitchingOrganization(true);
      try {
        const service = await getOrganizationsService();
        await service.switchOrganization(organizationId);
        window.location.reload();
      } catch {
        setIsSwitchingOrganization(false);
        setOrganizationsError('Failed to switch organization');
      }
    },
    [getOrganizationsService, isSwitchingOrganization],
  );

  const handleSwitchBrand = useCallback(
    async (id: string) => {
      if (isSwitchingBrand) {
        return;
      }
      const url = `PATCH /brands/${id}`;
      try {
        setIsSwitchingBrand(true);
        const service = await getUsersService();
        await service.patchMeBrand(id, { isSelected: true });
        logger.info(`${url} success`);
        await user?.reload();

        const newBrand = brands.find((b) => b.id === id);
        if (newBrand?.slug) {
          push(`/${orgSlug}/${newBrand.slug}/workspace/overview`);
        } else {
          refresh();
        }
      } catch (error) {
        logger.error(`${url} failed`, error);
      } finally {
        setIsSwitchingBrand(false);
      }
    },
    [getUsersService, user, brands, orgSlug, push, refresh, isSwitchingBrand],
  );

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleOpenOrgSettings = useCallback(() => {
    close();
    push(orgHref('/settings'));
  }, [close, orgHref, push]);

  const handleOpenBrandSettings = useCallback(() => {
    close();
    push(selectedBrand ? href('/settings') : orgHref('/settings/brands'));
  }, [close, selectedBrand, href, orgHref, push]);

  const handleOpenCreateBrand = useCallback(() => {
    close();
    openBrandOverlay(null);
  }, [close, openBrandOverlay]);

  const handleCreateOrg = useCallback(async () => {
    const trimmed = newOrgLabel.trim();
    if (!trimmed) {
      setCreateOrgError('Organization name is required');
      return;
    }
    setIsCreatingOrg(true);
    setCreateOrgError(null);
    try {
      const service = await getOrganizationsService();
      await service.createOrganization({
        description: newOrgDescription.trim() || undefined,
        label: trimmed,
      });
      setIsCreateOrgOpen(false);
      setNewOrgLabel('');
      setNewOrgDescription('');
      window.location.reload();
    } catch {
      setIsCreatingOrg(false);
      setCreateOrgError('Failed to create organization');
    }
  }, [getOrganizationsService, newOrgLabel, newOrgDescription]);

  const trigger = (
    <Button
      type="button"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      data-testid="workspace-switcher-trigger"
      ariaLabel="Switch workspace"
      isDisabled={isSwitchingOrganization}
      className={cn(
        'flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 transition-colors cursor-pointer',
        'hover:bg-white/[0.06]',
        isSwitchingOrganization && 'opacity-50 cursor-not-allowed',
        isOpen && 'bg-white/[0.06]',
      )}
    >
      {triggerImage ? (
        <div className="flex size-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-background">
          <Image
            src={triggerImage}
            alt={triggerLabel}
            width={20}
            height={20}
            className="object-cover object-center"
            sizes="20px"
            style={{ height: 'auto', width: 'auto' }}
          />
        </div>
      ) : (
        <div className="flex size-5 flex-shrink-0 items-center justify-center rounded bg-white/10 text-[10px] font-bold text-white/70">
          {triggerLabel.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col text-left leading-tight">
        <span className="truncate text-[13px] font-medium text-foreground/88">
          {isSwitchingOrganization ? 'Switching…' : triggerLabel}
        </span>
        {triggerSubLabel ? (
          <span className="truncate text-[10px] text-foreground/40">
            {triggerSubLabel}
          </span>
        ) : null}
      </div>
      <HiChevronDown
        className={cn(
          'size-3.5 flex-shrink-0 text-white/40 transition-transform duration-200',
          isOpen && 'rotate-180',
        )}
      />
    </Button>
  );

  if (!isMounted) {
    return trigger;
  }

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverPanelContent
          align="start"
          className="py-1"
          style={{
            width: `max(var(--radix-popover-trigger-width), 260px)`,
          }}
        >
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
                    onSelect={() => void handleSwitchOrganization(org.id)}
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
                        onSelect={() => void handleSwitchBrand(brand.id)}
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
              onClick={handleOpenOrgSettings}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
            >
              <HiOutlineCog6Tooth className="size-3.5 flex-shrink-0" />
              <span>Organization settings</span>
            </Button>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={handleOpenBrandSettings}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
            >
              <HiOutlineCog6Tooth className="size-3.5 flex-shrink-0" />
              <span>Brand settings</span>
            </Button>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={handleOpenCreateBrand}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
            >
              <HiPlus className="size-3.5 flex-shrink-0" />
              <span>New brand</span>
            </Button>
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => {
                close();
                setIsCreateOrgOpen(true);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors duration-150 cursor-pointer"
            >
              <HiOutlineBuildingOffice2 className="size-3.5 flex-shrink-0" />
              <span>New organization</span>
            </Button>
          </div>
        </PopoverPanelContent>
      </Popover>

      <Modal.Root open={isCreateOrgOpen} onOpenChange={setIsCreateOrgOpen}>
        <Modal.Content size="sm">
          <Modal.Header>
            <Modal.Title>Create Organization</Modal.Title>
            <Modal.Description>
              A new workspace with a default brand and 100 starter credits.
            </Modal.Description>
          </Modal.Header>

          <Modal.Body>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="workspace-switcher-org-name"
                  className="text-xs font-medium text-white/70"
                >
                  Name <span className="text-red-400">*</span>
                </label>
                <Input
                  id="workspace-switcher-org-name"
                  type="text"
                  value={newOrgLabel}
                  onChange={(e) => setNewOrgLabel(e.target.value)}
                  placeholder="My Organization"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleCreateOrg();
                    }
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="workspace-switcher-org-description"
                  className="text-xs font-medium text-white/70"
                >
                  Description <span className="text-white/30">(optional)</span>
                </label>
                <Textarea
                  id="workspace-switcher-org-description"
                  value={newOrgDescription}
                  onChange={(e) => setNewOrgDescription(e.target.value)}
                  placeholder="What does this organization do?"
                  rows={2}
                  className="resize-none"
                />
              </div>

              {createOrgError ? (
                <p className="text-xs text-red-400">{createOrgError}</p>
              ) : null}
            </div>
          </Modal.Body>

          <Modal.Footer>
            <Modal.CloseButton asChild>
              <Button
                variant={ButtonVariant.GHOST}
                withWrapper={false}
                className="px-4 py-2 text-sm text-white/60 transition-colors hover:text-white"
              >
                Cancel
              </Button>
            </Modal.CloseButton>
            <Button
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
              isDisabled={isCreatingOrg || newOrgLabel.trim().length === 0}
              onClick={() => void handleCreateOrg()}
              className="px-4 py-2 text-sm font-medium"
            >
              {isCreatingOrg ? 'Creating…' : 'Create'}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}
