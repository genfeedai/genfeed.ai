'use client';

import { useAuth } from '@clerk/nextjs';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/enums';
import type { IOrganization } from '@genfeedai/interfaces';
import type { IElementContentProps } from '@genfeedai/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { Preset } from '@models/elements/preset.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { PresetsService } from '@services/elements/presets.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { LazyModalPreset } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiPencil, HiPlus, HiTrash } from 'react-icons/hi2';

export default function PresetsList({
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
}: IElementContentProps) {
  const { isSignedIn } = useAuth();
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const getPresetsService = useAuthedService((token: string) =>
    PresetsService.getInstance(token),
  );

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
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
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
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
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams?.get('page')) || 1;

  // Load presets using useResource (handles AbortController cleanup properly)
  const {
    data: presets,
    isLoading,
    isRefreshing,
    refresh: refreshPresets,
  } = useResource(
    async () => {
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
    {
      defaultValue: [] as Preset[],
      dependencies: [currentPage, scope, adminOrg, adminBrand],
      enabled: !!isSignedIn,
      onError: (error) => {
        logger.error('GET /presets failed', error);
        notificationsService.error('Failed to load presets');
      },
    },
  );

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  const columns: TableColumn<Preset>[] = [
    {
      header: 'Label',
      key: 'label',
      render: (preset: Preset) => (
        <div className="max-w-40 overflow-hidden break-words whitespace-pre-line line-clamp-1">
          {preset.label || '-'}
        </div>
      ),
    },
    {
      header: 'Description',
      key: 'description',
      render: (preset: Preset) => (
        <div className="max-w-40 overflow-hidden break-words whitespace-pre-line line-clamp-2">
          {preset.description || '-'}
        </div>
      ),
    },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Organization',
      key: 'organization',
      render: (preset: Preset) => {
        const organization = preset.organization as IOrganization;
        const orgLabel = organization.label || 'Genfeed.ai';
        const isOrgPreset = !!organization.label;

        return (
          <Badge
            className={`text-xs border border-white/[0.08] bg-transparent uppercase ${
              isOrgPreset ? 'text-primary' : 'text-warning'
            }`}
          >
            {orgLabel}
          </Badge>
        );
      },
    },
    {
      header: 'Category',
      key: 'category',
      render: (preset: Preset) => (
        <Badge className="text-xs border border-white/[0.08] bg-transparent uppercase">
          {preset.category}
        </Badge>
      ),
    },
    {
      header: 'Default Values',
      key: 'defaults',
      render: (preset: Preset) => {
        const defaults = [];
        if (preset.defaultCamera) {
          defaults.push(`Camera: ${preset.defaultCamera}`);
        }
        if (preset.defaultScene) {
          defaults.push(`Scene: ${preset.defaultScene}`);
        }
        if (preset.defaultStyle) {
          defaults.push(`Style: ${preset.defaultStyle}`);
        }
        if (preset.defaultMoods?.length) {
          defaults.push(`Moods: ${preset.defaultMoods.join(', ')}`);
        }
        if (preset.defaultBlacklists?.length) {
          defaults.push(`Blacklists: ${preset.defaultBlacklists.join(', ')}`);
        }

        return defaults.length > 0 ? (
          <div className="flex flex-col gap-2 text-xs">
            {defaults.map((def) => (
              <Badge
                key={def}
                className="text-[10px] border border-white/[0.08] bg-transparent font-mono"
              >
                {def}
              </Badge>
            ))}
          </div>
        ) : (
          '-'
        );
      },
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
                onConfirm: () => handleDelete(),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

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

  const handleDelete = async () => {
    if (!selectedPreset) {
      return;
    }

    try {
      const service = await getPresetsService();
      await service.delete(selectedPreset.id);
      notificationsService.success('Preset deleted');

      setSelectedPreset(null);
      refreshPresets();
    } catch (error) {
      logger.error('Failed to delete preset', error);
      notificationsService.error('Failed to delete preset');

      setSelectedPreset(null);
    }
  };

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

      {scope === PageScope.SUPERADMIN && (
        <LazyModalPreset
          item={selectedPreset}
          onClose={() => setSelectedPreset(null)}
          onConfirm={() => {
            setSelectedPreset(null);
            refreshPresets();
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="presets" />
      </div>
    </Container>
  );
}
