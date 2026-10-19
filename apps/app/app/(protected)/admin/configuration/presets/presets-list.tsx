'use client';

import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Preset } from '@models/elements/preset.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { PresetsService } from '@services/elements/presets.service';
import { useQuery } from '@tanstack/react-query';
import AdminOrgBrandUrlFilter, {
  useAdminOrgBrandParams,
} from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import Badge from '@ui/display/badge/Badge';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import {
  PresetCategoryCell,
  PresetDefaultsCell,
  PresetKeyCell,
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
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const presetFieldsT = useTranslations('ui.presetFields');
  const notificationsService = NotificationsService.getInstance();
  const { openConfirm } = useConfirmModal();

  const getPresetsService = useAuthedService((token: string) =>
    PresetsService.getInstance(token),
  );

  const searchParams = useSearchParams();
  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const [selectedPreset, setSelectedPreset] = useState<Preset | null>();
  const [isTogglingActive, setIsTogglingActive] = useState(false);

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

    setIsTogglingActive(true);
    try {
      const service = await getPresetsService();
      await service.patch(preset.id, {
        isActive: newValue,
      });

      refreshPresets();
    } catch (error) {
      logger.error(`${url} failed`, error);
      notificationsService.error('Failed to update preset');
    } finally {
      setIsTogglingActive(false);
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
      subtext: (preset: Preset) => preset.description,
    },
    {
      header: 'Key',
      key: 'key',
      render: (preset: Preset) => <PresetKeyCell preset={preset} />,
    },
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
          isDisabled={scope !== PageScope.SUPERADMIN || isTogglingActive}
        />
      ),
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <Pencil />,
            onClick: (preset: Preset) =>
              openPresetModal(ModalEnum.PRESET, preset),
            tooltip: 'Edit',
          },
          {
            icon: <Trash2 />,
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

  const rowSidebar = createSummaryRowSidebar<Preset>({
    getBadges: (preset) => (
      <>
        <Badge variant="outline" className="uppercase">
          {preset.category}
        </Badge>
        {preset.isActive ? null : (
          <Badge variant="warning">{rowSidebarT('inactive')}</Badge>
        )}
      </>
    ),
    getFacts: (preset) => [
      { id: 'key', label: presetFieldsT('key'), value: preset.key },
      {
        id: 'description',
        label: presetFieldsT('description'),
        value: preset.description,
      },
      { id: 'model', label: fieldsT('model'), value: preset.model },
      { id: 'provider', label: fieldsT('provider'), value: preset.provider },
      { id: 'platform', label: fieldsT('platform'), value: preset.platform },
      {
        id: 'aspectRatio',
        label: presetFieldsT('aspectRatio'),
        value: preset.aspectRatio,
      },
      {
        id: 'duration',
        label: presetFieldsT('duration'),
        value: preset.duration,
      },
      { id: 'camera', label: presetFieldsT('camera'), value: preset.camera },
      { id: 'lens', label: presetFieldsT('lens'), value: preset.lens },
      {
        id: 'lighting',
        label: presetFieldsT('lighting'),
        value: preset.lighting,
      },
      {
        id: 'cameraMovement',
        label: presetFieldsT('cameraMovement'),
        value: preset.cameraMovement,
      },
      { id: 'mood', label: presetFieldsT('mood'), value: preset.mood },
      { id: 'scene', label: presetFieldsT('scene'), value: preset.scene },
      { id: 'style', label: presetFieldsT('style'), value: preset.style },
      { id: 'prompt', label: presetFieldsT('prompt'), value: preset.prompt },
    ],
    getId: (preset) => preset.id,
    getSubtitle: (preset) => preset.key,
    getTitle: (preset) => preset.label,
    kind: 'record',
    onEdit:
      scope === PageScope.SUPERADMIN
        ? (preset) => openPresetModal(ModalEnum.PRESET, preset)
        : undefined,
  });

  return (
    <AdminPageShell
      title="Presets"
      onRefresh={() => refreshPresets()}
      isRefreshing={isRefreshing}
      dropdowns={
        scope === PageScope.SUPERADMIN ? <AdminOrgBrandUrlFilter /> : undefined
      }
      primaryAction={
        scope === PageScope.SUPERADMIN ? (
          <Button
            label="Preset"
            icon={<Plus />}
            variant={ButtonVariant.DEFAULT}
            onClick={() => openPresetModal(ModalEnum.PRESET)}
          />
        ) : undefined
      }
    >
      <AppTable<Preset>
        items={presets}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
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
    </AdminPageShell>
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
