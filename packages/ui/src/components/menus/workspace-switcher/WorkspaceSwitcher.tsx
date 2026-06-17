'use client';

import { useUser } from '@clerk/nextjs';
import { useBrandOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@genfeedai/contexts/user/brand-context/brand-context.helpers';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreateOrgModal } from './CreateOrgModal';
import { WorkspaceSwitcherPanel } from './WorkspaceSwitcherPanel';
import { WorkspaceSwitcherTrigger } from './WorkspaceSwitcherTrigger';

type OrganizationEntry = {
  id: string;
  label: string;
  isActive: boolean;
  brand: { id: string; label: string } | null;
};

function getCurrentBrandScopedPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);

  if (parts.length >= 3 && parts[1] !== '~') {
    return `/${parts.slice(2).join('/')}`;
  }

  return '/workspace/overview';
}

export default function WorkspaceSwitcher() {
  const { user } = useUser();
  const { brands, brandId, setBrandId, setOrganizationId } = useBrand();
  const { openBrandOverlay } = useBrandOverlay();
  const { push, refresh } = useRouter();
  const pathname = usePathname();
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
    () => brands.find((brand) => getBrandEntityId(brand) === brandId),
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
        const updatedBrand = await service.patchMeBrand(id, {
          isSelected: true,
        });
        logger.info(`${url} success`);

        const newBrand =
          brands.find((brand) => getBrandEntityId(brand) === id) ??
          updatedBrand;
        if (newBrand?.slug) {
          const nextBrandId = getBrandEntityId(newBrand) || id;
          const nextOrganizationId = getBrandOrganizationId(newBrand);
          const nextOrgSlug = getBrandOrganizationSlug(newBrand) || orgSlug;

          setBrandId(nextBrandId);
          if (nextOrganizationId) {
            setOrganizationId(nextOrganizationId);
          }
          setIsOpen(false);
          push(
            `/${nextOrgSlug}/${newBrand.slug}${getCurrentBrandScopedPath(pathname)}`,
          );
          const reloadPromise = user?.reload();
          void reloadPromise?.catch((error) => {
            logger.error('Failed to reload user after brand switch', error);
          });
        } else {
          refresh();
        }
      } catch (error) {
        logger.error(`${url} failed`, error);
      } finally {
        setIsSwitchingBrand(false);
      }
    },
    [
      getUsersService,
      user,
      brands,
      orgSlug,
      pathname,
      push,
      refresh,
      setBrandId,
      setOrganizationId,
      isSwitchingBrand,
    ],
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
    <WorkspaceSwitcherTrigger
      triggerLabel={triggerLabel}
      triggerSubLabel={triggerSubLabel}
      triggerImage={triggerImage}
      isSwitchingOrganization={isSwitchingOrganization}
      isOpen={isOpen}
    />
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
          <WorkspaceSwitcherPanel
            organizations={organizations}
            organizationsError={organizationsError}
            brands={brands}
            brandId={brandId}
            isSwitchingOrganization={isSwitchingOrganization}
            isSwitchingBrand={isSwitchingBrand}
            onSwitchOrganization={(id) => void handleSwitchOrganization(id)}
            onSwitchBrand={(id) => void handleSwitchBrand(id)}
            onOpenOrgSettings={handleOpenOrgSettings}
            onOpenBrandSettings={handleOpenBrandSettings}
            onOpenCreateBrand={handleOpenCreateBrand}
            onOpenCreateOrg={() => {
              close();
              setIsCreateOrgOpen(true);
            }}
          />
        </PopoverPanelContent>
      </Popover>

      <CreateOrgModal
        isOpen={isCreateOrgOpen}
        onOpenChange={setIsCreateOrgOpen}
        newOrgLabel={newOrgLabel}
        onNewOrgLabelChange={setNewOrgLabel}
        newOrgDescription={newOrgDescription}
        onNewOrgDescriptionChange={setNewOrgDescription}
        isCreatingOrg={isCreatingOrg}
        createOrgError={createOrgError}
        onCreateOrg={() => void handleCreateOrg()}
      />
    </>
  );
}
