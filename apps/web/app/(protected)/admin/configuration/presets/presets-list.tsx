'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import {
  ButtonVariant,
  ModalEnum,
  ModelCategory,
  PageScope,
} from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type { SummaryFact } from '@genfeedai/props/ui/display/table-row-summary.props';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { Preset } from '@models/elements/preset.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { PresetsService } from '@services/elements/presets.service';
import { normalizeElementKey } from '@ui/display/element-scope-badge/element-row-sidebar';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import AdminScopeFilter from '@/components/content/admin-filters/AdminScopeFilter';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';
import PresetDescriptionActions from './preset-description-actions';
import {
  PresetCategoryCell,
  PresetDefaultsCell,
  PresetKeyCell,
  PresetLabelCell,
  PresetOrganizationCell,
} from './presets-list-columns';
import PresetsListModals from './presets-list-modals';

// A preset's label and key live in its JSON config, which the API cannot order
// by, so only the real columns sort.
const PRESET_SORT_KEYS = ['category', 'isActive'];
const EMPTY_PRESETS: Preset[] = [];

/** Free-text preset fields edited in place; each is a key of `Preset`. */
const PRESET_TEXT_FIELDS: ReadonlyArray<{
  field:
    | 'aspectRatio'
    | 'camera'
    | 'cameraMovement'
    | 'description'
    | 'key'
    | 'label'
    | 'lens'
    | 'lighting'
    | 'mood'
    | 'prompt'
    | 'promptTemplate'
    | 'scene'
    | 'style';
  isMultiline?: boolean;
  isRequired?: boolean;
}> = [
  { field: 'label', isRequired: true },
  { field: 'key', isRequired: true },
  { field: 'description', isMultiline: true },
  { field: 'prompt', isMultiline: true },
  { field: 'aspectRatio' },
  { field: 'promptTemplate' },
  { field: 'style' },
  { field: 'mood' },
  { field: 'scene' },
  { field: 'camera' },
  { field: 'lens' },
  { field: 'lighting' },
  { field: 'cameraMovement' },
];

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
  const searchT = useTranslations('common.adminSearch');
  const { search, setSearch } = useAdminSearchParam();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: PRESET_SORT_KEYS,
  });
  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const [isTogglingActive, setIsTogglingActive] = useState(false);

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  // Cached per page with the signed-in account in the key: coming back paints
  // the rows and footer it already has while they refresh.
  const presetsQuery = usePagedAuthedQuery({
    enabled: Boolean(isSignedIn),
    queryFn: async (service, signal) => {
      const queryParams: Record<string, unknown> = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        ...(search ? { search } : {}),
        ...(sort ? { sort } : {}),
      };

      if (scope === PageScope.SUPERADMIN) {
        if (adminOrg) {
          queryParams.organization = adminOrg;
        }
        if (adminBrand) {
          queryParams.brand = adminBrand;
        }
      }

      try {
        const data = await service.findAllPage(queryParams, signal);
        logger.info('GET /presets success', data);
        return data;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /presets failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      'admin',
      'presets',
      { adminBrand, adminOrg, page: currentPage, scope, search, sort },
    ],
    service: (token: string) => PresetsService.getInstance(token),
  });
  const presets = presetsQuery.data?.items ?? EMPTY_PRESETS;
  const {
    errorUpdatedAt,
    isError,
    isFetching,
    isLoading,
    refetch: refreshPresets,
  } = presetsQuery;

  const isRefreshing = isFetching && !isLoading;

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load presets');
    }
  }, [errorUpdatedAt, isError, notificationsService]);

  // Notify parent of loading/refreshing state changes
  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    onRefreshingChange?.(isRefreshing);
  }, [isRefreshing, onRefreshingChange]);

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

      refreshPresets();
    } catch (error) {
      logger.error('Failed to delete preset', error);
      notificationsService.error('Failed to delete preset');
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
      sortable: true,
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
      sortable: true,
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
            icon: <Trash2 />,
            onClick: (preset: Preset) => {
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

  const savePreset = useInlineRecordSave<Partial<Preset>>({
    errorMessage: 'Failed to update preset',
    onSaved: () => refreshPresets(),
    save: async (id, patch) => (await getPresetsService()).patch(id, patch),
  });

  const isEditable = scope === PageScope.SUPERADMIN;

  const rowSidebar = createSummaryRowSidebar<Preset>({
    getBadges: (preset) => (
      <>
        <Badge variant="outline">{preset.category}</Badge>
        {preset.isActive ? null : (
          <Badge variant="warning">{rowSidebarT('inactive')}</Badge>
        )}
      </>
    ),
    getFacts: (preset) => [
      ...PRESET_TEXT_FIELDS.map(
        ({ field, isMultiline, isRequired }): SummaryFact => ({
          editor: isEditable
            ? {
                ariaLabel: presetFieldsT(field),
                isMultiline,
                isRequired,
                kind: 'text',
                onSave: (value) =>
                  savePreset(preset.id, {
                    [field]:
                      field === 'key' ? normalizeElementKey(value) : value,
                  }),
                placeholder: '-',
                value: preset[field],
              }
            : undefined,
          id: field,
          label: presetFieldsT(field),
          value: preset[field],
        }),
      ),
      {
        editor: isEditable
          ? {
              ariaLabel: presetFieldsT('type'),
              kind: 'select',
              onSave: (category) =>
                savePreset(preset.id, {
                  category: category as Preset['category'],
                }),
              options: Object.values(ModelCategory).map((category) => ({
                label: category,
                value: category,
              })),
              value: preset.category,
            }
          : undefined,
        id: 'category',
        label: presetFieldsT('type'),
        value: preset.category,
      },
      {
        editor: isEditable
          ? {
              ariaLabel: presetFieldsT('duration'),
              isRequired: true,
              kind: 'text',
              onSave: (value) => {
                const duration = Number(value);
                if (!Number.isFinite(duration) || duration <= 0) {
                  throw new Error('Invalid duration');
                }
                return savePreset(preset.id, { duration });
              },
              value: preset.duration === undefined ? '' : `${preset.duration}`,
            }
          : undefined,
        id: 'duration',
        label: presetFieldsT('duration'),
        value: preset.duration,
      },
      ...(isEditable
        ? [
            {
              editor: {
                ariaLabel: fieldsT('active'),
                isChecked: preset.isActive !== false,
                kind: 'switch' as const,
                onSave: (isActive: boolean) =>
                  savePreset(preset.id, { isActive }),
              },
              id: 'active',
              label: fieldsT('active'),
            },
          ]
        : []),
      { id: 'model', label: fieldsT('model'), value: preset.model },
      { id: 'provider', label: fieldsT('provider'), value: preset.provider },
      { id: 'platform', label: fieldsT('platform'), value: preset.platform },
    ],
    getId: (preset) => preset.id,
    getSubtitle: (preset) => preset.key,
    getTitle: (preset) => preset.label,
    kind: 'record',
    renderExtra: (preset) =>
      isEditable ? (
        <PresetDescriptionActions
          key={preset.id}
          onSave={(description) => savePreset(preset.id, { description })}
          preset={preset}
        />
      ) : null,
  });

  return (
    <AdminPageShell
      title="Presets"
      search={
        <SearchField
          ariaLabel={searchT('presets')}
          onSearch={setSearch}
          placeholder={searchT('presets')}
          value={search}
        >
          {scope === PageScope.SUPERADMIN ? (
            <AdminScopeFilter isAttached />
          ) : null}
        </SearchField>
      }
      onRefresh={() => refreshPresets()}
      isRefreshing={isRefreshing}
      primaryAction={
        scope === PageScope.SUPERADMIN ? (
          <Button
            label="Preset"
            icon={<Plus />}
            variant={ButtonVariant.DEFAULT}
            onClick={() => openModal(ModalEnum.PRESET)}
          />
        ) : undefined
      }
    >
      <AppTable<Preset>
        items={presets}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No presets found"
      />

      <PresetsListModals scope={scope} onConfirm={() => refreshPresets()} />

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="presets"
          totals={presetsQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
        />
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
