'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/enums';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Preset } from '@models/elements/preset.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { PresetsService } from '@services/elements/presets.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { HiPencil, HiPlus, HiTrash } from 'react-icons/hi2';
import {
  PresetCategoryCell,
  PresetDefaultsCell,
  PresetDescriptionCell,
  PresetLabelCell,
  PresetOrganizationCell,
} from './presets-list-columns';
import PresetsListModals from './presets-list-modals';

function PresetsListContent({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
}: IElementContentProps) {
  const { isSignedIn } = useAuthIdentity();
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const getPresetsService = useAuthedService((token: string) =>
    PresetsService.getInstance(token),
  );

  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const [selectedPreset, setSelectedPreset] = useState<Preset | null>();

  // Admin org/brand filter state (superadmin only)
  const [adminOrg, setAdminOrg] = useState(
    () => parsedSearchParams.get('organization') || '',
  );
  const [adminBrand, setAdminBrand] = useState(
    () => parsedSearchParams.get('brand') || '',
  );

  // Admin filter URL sync handlers
  const handleAdminOrgChange = useCallback(
    (orgId: string) => {
      setAdminOrg(orgId);
      setAdminBrand('');
      const params = new URLSearchParams(searchParamsString);
      if (orgId) {
        params.set('organization', orgId);
      } else {
        params.delete('organization');
      }
      params.delete('brand');
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  const handleAdminBrandChange = useCallback(
    (brandId: string) => {
      setAdminBrand(brandId);
      const params = new URLSearchParams(searchParamsString);
      if (brandId) {
        params.set('brand', brandId);
      } else {
        params.delete('brand');
      }
      params.delete('page');
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  const {
    data: presets = [] as Preset[],
    isLoading,
    isFetching,
    error: presetsError,
    refetch: refreshPresets,
  } = useQuery({
    queryKey: ['presets', currentPage, scope, adminOrg, adminBrand],
    queryFn: async () => {
      const url = `GET /presets`;
      const service = await getPresetsService();

      const queryParams: Record<string, unknown> = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
      };

      if (scope === PageScope.SUPERADMIN) {
        if (adminOrg) {
          queryParams.organization = adminOrg;
        }
        if (adminBrand) {
          queryParams.brand = adminBrand;
        }
      }

      const data = await service.findAll(queryParams);

      logger.info(`${url} success`, data);
      return data;
    },
    enabled: !!isSignedIn,
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (presetsError) {
      logger.error('GET /presets failed', presetsError);
      notificationsService.error('Failed to load presets');
    }
  }, [presetsError, notificationsService]);

  // Notify parent of loading/refreshing state changes
  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    onRefreshingChange?.(isRefreshing);
  }, [isRefreshing, onRefreshingChange]);

  const openPresetModal = (modalId: ModalEnum, preset?: Preset) => {
    setSelectedPreset(preset || null);
    openModal(modalId);
  };

  const handleToggleActive = async (preset: Preset) => {
    const url = `PATCH /presets/${preset.id}`;
    const newValue = !preset.isActive;

    try {
      const service = await getPresetsService();
      await service.patch(preset.id, {
        ...preset,
        isActive: newValue,
      });

      notificationsService.success(
        `Preset ${newValue ? 'activated' : 'deactivated'}`,
      );
    } catch (error) {
      logger.error(`${url} failed`, error);
      notificationsService.error('Failed to update preset');
    }
  };

  const handleDelete = async (preset: Preset) => {
    try {
      const service = await getPresetsService();
      await service.delete(preset.id);
      notificationsService.success('Preset deleted');

      setSelectedPreset(null);
      refreshPresets();
    } catch (error) {
      logger.error('Failed to delete preset', error);
      notificationsService.error('Failed to delete preset');

      setSelectedPreset(null);
    }
  };

  const columns: TableColumn<Preset>[] = [
    {
      header: 'Label',
      key: 'label',
      render: (preset: Preset) => <PresetLabelCell preset={preset} />,
    },
    {
      header: 'Description',
      key: 'description',
      render: (preset: Preset) => <PresetDescriptionCell preset={preset} />,
    },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Organization',
      key: 'organization',
      render: (preset: Preset) => <PresetOrganizationCell preset={preset} />,
    },
    {
      header: 'Category',
      key: 'category',
      render: (preset: Preset) => <PresetCategoryCell preset={preset} />,
    },
    {
      header: 'Default Values',
      key: 'defaults',
      render: (preset: Preset) => <PresetDefaultsCell preset={preset} />,
    },
    {
      header: 'Active',
      key: 'isActive',
      render: (preset: Preset) => (
        <Switch
          isChecked={preset.isActive}
          onChange={() => handleToggleActive(preset)}
          isDisabled={scope !== PageScope.SUPERADMIN}
        />
      ),
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <HiPencil />,
            onClick: (preset: Preset) =>
              openPresetModal(ModalEnum.PRESET, preset),
            tooltip: 'Edit',
          },
          {
            icon: <HiTrash />,
            onClick: (preset: Preset) => {
              setSelectedPreset(preset);
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Preset',
                message: `Are you sure you want to delete "${preset.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(preset),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  return (
    <Container
      right={
        <>
          <ButtonRefresh
            onClick={() => refreshPresets()}
            isRefreshing={isRefreshing}
          />

          {scope === PageScope.SUPERADMIN && (
            <Button
              label="Preset"
              icon={<HiPlus />}
              variant={ButtonVariant.DEFAULT}
              onClick={() => openPresetModal(ModalEnum.PRESET)}
            />
          )}
        </>
      }
    >
      {scope === PageScope.SUPERADMIN && (
        <div className="mb-4">
          <AdminOrgBrandFilter
            organization={adminOrg}
            brand={adminBrand}
            onOrganizationChange={handleAdminOrgChange}
            onBrandChange={handleAdminBrandChange}
          />
        </div>
      )}

      <AppTable<Preset>
        items={presets}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel="No presets found"
      />

      <PresetsListModals
        scope={scope}
        selectedPreset={selectedPreset}
        onClose={() => setSelectedPreset(null)}
        onConfirm={() => {
          setSelectedPreset(null);
          refreshPresets();
        }}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="presets" />
      </div>
    </Container>
  );
}

export default function PresetsList(
  props: Parameters<typeof PresetsListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <PresetsListContent {...props} />
    </Suspense>
  );
}
