'use client';

import { useUser } from '@clerk/nextjs';
import { useBrandOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { Modal } from '@ui/modals/compound/Modal';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Textarea } from '@ui/primitives/textarea';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  HiCheck,
  HiChevronDown,
  HiOutlineSquares2X2,
  HiPlus,
} from 'react-icons/hi2';

type OrganizationEntry = {
  id: string;
  label: string;
  isActive: boolean;
  slug: string;
  brand: { id: string; label: string } | null;
};

export default function TopbarWorkspaceSwitcher() {
  const logoUrl = useThemeLogo();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const { brandId, brands } = useBrand();
  const { orgHref, orgSlug } = useOrgUrl();
  const { openBrandOverlay } = useBrandOverlay();

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [orgs, setOrgs] = useState<OrganizationEntry[]>([]);
  const [organizationsError, setOrganizationsError] = useState<string | null>(
    null,
  );
  const [isSwitchingOrganization, setIsSwitchingOrganization] = useState(false);
  const [isUpdatingBrand, setIsUpdatingBrand] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newOrganizationLabel, setNewOrganizationLabel] = useState('');
  const [newOrganizationDescription, setNewOrganizationDescription] =
    useState('');
  const [isCreatingOrganization, setIsCreatingOrganization] = useState(false);
  const [createOrganizationError, setCreateOrganizationError] = useState<
    string | null
  >(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const service = await getOrganizationsService();
        const data = await service.getMyOrganizations();

        if (!cancelled) {
          setOrgs(data);
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
    () => orgs.find((organization) => organization.isActive),
    [orgs],
  );
  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === brandId),
    [brands, brandId],
  );

  const isBusy = isSwitchingOrganization || isUpdatingBrand;
  const organizationLabel =
    organizationsError ?? activeOrganization?.label ?? 'Organization';

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      return;
    }

    const timeout = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 40);

    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  const handleOrganizationSwitch = useCallback(
    async (organizationId: string) => {
      if (isBusy) {
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
    [getOrganizationsService, isBusy],
  );

  const handleBrandSwitch = useCallback(
    async (nextBrandId: string) => {
      if (isBusy) {
        return;
      }

      const requestLabel = `PATCH /brands/${nextBrandId}`;

      try {
        setIsUpdatingBrand(true);
        const service = await getUsersService();
        await service.patchMeBrand(nextBrandId, { isSelected: true });
        logger.info(`${requestLabel} success`);
        await user?.reload();

        const isIngredientsDetailRoute = pathname?.match(
          /^\/ingredients\/[^/]+/,
        );
        setIsOpen(false);

        if (isIngredientsDetailRoute) {
          const [, , type] = pathname?.split('/') ?? [];
          router.push(`/ingredients/${type}`);
        } else {
          router.refresh();
        }

        setIsUpdatingBrand(false);
      } catch (error) {
        logger.error(`${requestLabel} failed`, error);
        setIsUpdatingBrand(false);
      }
    },
    [getUsersService, isBusy, pathname, router, user],
  );

  const handleClearBrandSelection = useCallback(async () => {
    if (isBusy || !brandId) {
      return;
    }

    try {
      setIsUpdatingBrand(true);
      const service = await getUsersService();
      await service.deleteMeBrandSelection();
      logger.info('DELETE /users/me/brand-selection success');
      await user?.reload();
      setIsOpen(false);
      router.push(orgHref('/overview'));
      router.refresh();
      setIsUpdatingBrand(false);
    } catch (error) {
      logger.error('DELETE /users/me/brand-selection failed', error);
      setIsUpdatingBrand(false);
    }
  }, [brandId, getUsersService, isBusy, orgHref, router, user]);

  const handleCreateOrganization = useCallback(async () => {
    const trimmedLabel = newOrganizationLabel.trim();

    if (!trimmedLabel) {
      setCreateOrganizationError('Organization name is required');
      return;
    }

    setIsCreatingOrganization(true);
    setCreateOrganizationError(null);

    try {
      const service = await getOrganizationsService();
      await service.createOrganization({
        description: newOrganizationDescription.trim() || undefined,
        label: trimmedLabel,
      });
      setCreateModalOpen(false);
      setNewOrganizationLabel('');
      setNewOrganizationDescription('');
      window.location.reload();
    } catch {
      setIsCreatingOrganization(false);
      setCreateOrganizationError('Failed to create organization');
    }
  }, [
    getOrganizationsService,
    newOrganizationDescription,
    newOrganizationLabel,
  ]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredOrganizations = useMemo(
    () =>
      orgs.filter((organization) =>
        organization.label.toLowerCase().includes(normalizedSearch),
      ),
    [normalizedSearch, orgs],
  );
  const filteredBrands = useMemo(
    () =>
      brands.filter((brand) =>
        `${brand.label ?? 'Untitled'}${brand.isDarkroomEnabled ? ' darkroom' : ''}`
          .toLowerCase()
          .includes(normalizedSearch),
      ),
    [brands, normalizedSearch],
  );

  const handleEscAction = useCallback(() => {
    if (searchTerm.trim().length > 0) {
      setSearchTerm('');
      searchInputRef.current?.focus();
      return;
    }

    if (brandId) {
      void handleClearBrandSelection();
      return;
    }

    setIsOpen(false);
  }, [brandId, handleClearBrandSelection, searchTerm]);

  return (
    <>
      <Popover
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (isBusy) {
            return;
          }

          setIsOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            ariaLabel="Open projects switcher"
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 transition-colors',
              'hover:border-white/[0.12] hover:bg-white/[0.06]',
              isOpen && 'border-white/[0.12] bg-white/[0.06]',
              isBusy && 'cursor-not-allowed opacity-60',
            )}
            isDisabled={isBusy}
          >
            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md bg-white/[0.08]">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={EnvironmentService.LOGO_ALT}
                  width={16}
                  height={16}
                  className="h-4 w-4 object-contain dark:invert"
                  sizes="16px"
                />
              ) : (
                <span className="text-xs font-semibold text-white/90">G</span>
              )}
            </div>

            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-white/90">
              All Projects
            </span>

            <HiChevronDown
              className={cn(
                'h-3.5 w-3.5 flex-shrink-0 text-white/40 transition-transform duration-200',
                isOpen && 'rotate-180',
              )}
            />
          </Button>
        </PopoverTrigger>

        <PopoverPanelContent
          align="start"
          className="w-[420px] p-0"
          sideOffset={10}
        >
          <div className="border-b border-white/[0.08] p-3">
            <div className="relative">
              <Input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Find Project..."
                className="h-11 rounded-xl border-white/[0.08] bg-white/[0.02] pr-14 text-sm"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/80"
              >
                Esc
              </Button>
            </div>
          </div>

          <div className="max-h-[30rem] overflow-y-auto px-2 py-2">
            <WorkspaceSwitcherSection
              emptyMessage={
                organizationsError ?? 'No organizations available right now'
              }
              items={filteredOrganizations.map((organization) => ({
                icon: <HiOutlineSquares2X2 className="h-4 w-4 text-white/35" />,
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

          <div className="border-t border-white/[0.08] p-2">
            <WorkspaceActionButton
              label="Create Project"
              onClick={() => {
                setIsOpen(false);
                openBrandOverlay(null);
              }}
            />
            <WorkspaceActionButton
              label="New Organization"
              onClick={() => {
                setIsOpen(false);
                setCreateModalOpen(true);
              }}
            />
          </div>
        </PopoverPanelContent>
      </Popover>

      <Modal.Root open={createModalOpen} onOpenChange={setCreateModalOpen}>
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
                <label className="text-xs font-medium text-white/70">
                  Name <span className="text-red-400">*</span>
                </label>
                <Input
                  type="text"
                  value={newOrganizationLabel}
                  onChange={(event) =>
                    setNewOrganizationLabel(event.target.value)
                  }
                  placeholder="My Organization"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleCreateOrganization();
                    }
                  }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-white/70">
                  Description <span className="text-white/30">(optional)</span>
                </label>
                <Textarea
                  value={newOrganizationDescription}
                  onChange={(event) =>
                    setNewOrganizationDescription(event.target.value)
                  }
                  placeholder="What does this organization do?"
                  rows={2}
                  className="resize-none"
                />
              </div>

              {createOrganizationError ? (
                <p className="text-xs text-red-400">
                  {createOrganizationError}
                </p>
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
              isDisabled={
                isCreatingOrganization ||
                newOrganizationLabel.trim().length === 0
              }
              onClick={() => void handleCreateOrganization()}
              className="px-4 py-2 text-sm font-medium"
            >
              {isCreatingOrganization ? 'Creating\u2026' : 'Create'}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}

function WorkspaceSwitcherSection({
  emptyMessage,
  items,
  title,
  onSelect,
}: {
  emptyMessage: string;
  items: {
    icon?: ReactNode;
    id: string;
    imageUrl?: string;
    isActive: boolean;
    label: string;
    meta?: string;
  }[];
  title: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="border-b border-white/[0.08] px-2 py-2 last:border-b-0">
      <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white/35">
        {title}
      </p>

      {items.length === 0 ? (
        <div className="px-2 py-2 text-xs text-white/40">{emptyMessage}</div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <Button
              key={item.id}
              ariaLabel={`Select ${item.label}`}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => {
                if (!item.isActive) {
                  onSelect(item.id);
                }
              }}
              isDisabled={item.isActive}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors',
                item.isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/70 hover:bg-white/[0.05] hover:text-white',
              )}
            >
              {item.imageUrl ? (
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-background">
                  <Image
                    src={item.imageUrl}
                    alt={item.label}
                    width={20}
                    height={20}
                    className="object-cover object-center"
                    sizes="20px"
                    style={{ height: 'auto', width: 'auto' }}
                  />
                </div>
              ) : item.icon ? (
                <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                  {item.icon}
                </div>
              ) : (
                <div
                  className={cn(
                    'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    item.isActive
                      ? 'bg-primary/30 text-primary'
                      : 'bg-white/10 text-white/60',
                  )}
                >
                  {item.label.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.label}</p>
                {item.meta ? (
                  <p className="truncate text-xs text-white/40">{item.meta}</p>
                ) : null}
              </div>

              {item.isActive ? (
                <HiCheck className="h-4 w-4 flex-shrink-0 text-primary" />
              ) : null}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      ariaLabel={label}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-white/65 transition-colors hover:bg-white/[0.05] hover:text-white"
    >
      <HiPlus className="h-4 w-4 flex-shrink-0" />
      <span>{label}</span>
    </Button>
  );
}
