'use client';

import { useUser } from '@clerk/nextjs';
import { useBrandOverlay } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import { logger } from '@genfeedai/services/core/logger.service';
import { OrganizationsService } from '@genfeedai/services/organization/organizations.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type OrganizationEntry = {
  id: string;
  label: string;
  isActive: boolean;
  slug: string;
  brand: { id: string; label: string } | null;
};

export function useTopbarWorkspaceSwitcher() {
  const logoUrl = useThemeLogo();
  const pathname = usePathname();
  const { push, refresh } = useRouter();
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
          push(`/ingredients/${type}`);
        } else {
          refresh();
        }

        setIsUpdatingBrand(false);
      } catch (error) {
        logger.error(`${requestLabel} failed`, error);
        setIsUpdatingBrand(false);
      }
    },
    [getUsersService, isBusy, pathname, user, refresh, push],
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
      push(orgHref('/overview'));
      refresh();
      setIsUpdatingBrand(false);
    } catch (error) {
      logger.error('DELETE /users/me/brand-selection failed', error);
      setIsUpdatingBrand(false);
    }
  }, [brandId, getUsersService, isBusy, orgHref, user, refresh, push]);

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

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (isBusy) {
        return;
      }
      setIsOpen(nextOpen);
    },
    [isBusy],
  );

  const handleOpenCreateProject = useCallback(() => {
    setIsOpen(false);
    openBrandOverlay(null);
  }, [openBrandOverlay]);

  const handleOpenNewOrganization = useCallback(() => {
    setIsOpen(false);
    setCreateModalOpen(true);
  }, []);

  return {
    logoUrl,
    orgSlug,
    brandId,
    isOpen,
    setIsOpen,
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
  };
}
