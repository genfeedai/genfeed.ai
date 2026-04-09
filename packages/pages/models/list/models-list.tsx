'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum, ModelCategory, PageScope } from '@genfeedai/enums';
import type { IModel, IOrganizationSetting } from '@genfeedai/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { Model } from '@models/ai/model.model';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { ModelsService } from '@services/ai/models.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import StatsCards from '@ui/card/stats/StatsCards';
import AdminOrgBrandFilter from '@ui/content/admin-filters/AdminOrgBrandFilter';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { LazyModalModel } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Switch } from '@ui/primitives/switch';
import { ErrorHandler } from '@utils/error/error-handler.util';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiDocumentText,
  HiFilm,
  HiInformationCircle,
  HiMusicalNote,
  HiPhoto,
  HiTrash,
} from 'react-icons/hi2';

export default function ModelsList({
  type,
  category,
  scope = PageScope.ORGANIZATION,
  onRefreshRegister,
  filters,
}: {
  type?: string;
  category?: string;
  scope?: PageScope;
  onRefreshRegister?: (fn: (() => Promise<void>) | null) => void;
  filters?: IFiltersState;
  onFiltersChange?: (filters: IFiltersState, query: IFilters) => void;
}) {
  const { organizationId } = useBrand();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const { openConfirm } = useConfirmModal();

  const router = useRouter();
  const pathname = usePathname();

  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentPage = Number(searchParams?.get('page')) || 1;

  const isAdminScope = scope === PageScope.SUPERADMIN;

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

  // Track which model is being toggled to prevent multiple simultaneous toggles
  const [togglingModelId, setTogglingModelId] = useState<string | null>(null);

  // Track if component is mounted to avoid calling callbacks during initial render
  const isMountedRef = useRef(false);

  // Admin-specific state
  const [selectedModel, setSelectedModel] = useState<IModel>();

  // Fetch organization settings to get enabled models (only for non-admin scopes)
  const { data: settings, refresh: refreshSettings } =
    useResource<IOrganizationSetting | null>(
      async () => {
        if (isAdminScope || !organizationId) {
          return null;
        }
        const service = await getOrganizationsService();
        const data = await service.findOne(organizationId);
        logger.info(
          `GET /organizations/${organizationId}/settings success`,
          data,
        );

        return data.settings;
      },
      {
        dependencies: [organizationId, isAdminScope],
        enabled: !isAdminScope && !!organizationId,
        onError: (error: Error) => {
          logger.error(
            `GET /organizations/${organizationId}/settings failed`,
            error,
          );
        },
      },
    );

  // Map route type to category filter
  const categoryFromType = useMemo(() => {
    if (!type || type === 'all') {
      return null;
    }
    if (type === 'images') {
      return ModelCategory.IMAGE;
    }
    if (type === 'videos') {
      return ModelCategory.VIDEO;
    }
    if (type === 'text') {
      return ModelCategory.TEXT;
    }

    return null;
  }, [type]);

  // Determine category filter (admin uses category prop, others use type/filters)
  const categoryFilter = useMemo(() => {
    if (isAdminScope && category) {
      return category === 'all' ? null : category;
    }
    return categoryFromType || filters?.category;
  }, [isAdminScope, category, categoryFromType, filters?.category]);

  // Fetch all system models with pagination
  const {
    data: models,
    isLoading,
    refresh,
    mutate: setModels,
  } = useResource<IModel[]>(
    async () => {
      const service = await getModelsService();
      const query: Record<string, any> = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        sort: 'label: 1', // Sort by label ascending
      };

      // Filter inactive models for non-admin scopes
      if (!isAdminScope) {
        query.isActive = true;
      }

      // Add category filter
      if (categoryFilter && categoryFilter !== 'all') {
        query.category = categoryFilter;
      }

      if (isAdminScope) {
        if (adminOrg) {
          query.organization = adminOrg;
        }
        if (adminBrand) {
          query.brand = adminBrand;
        }
      }

      const data: IModel[] = await service.findAll(query);
      logger.info('GET /models success', data);
      // Instantiate Model class for each item to enable getter methods
      return data.map((m) => new Model(m));
    },
    {
      defaultValue: [],
      dependencies: [
        categoryFilter,
        currentPage,
        isAdminScope,
        adminOrg,
        adminBrand,
      ],
      onError: (error: any) => {
        logger.error('GET /models failed', error);
      },
    },
  );

  // Fetch default models for admin cards
  const { data: defaultModelsData, isLoading: isLoadingDefaults } = useResource<
    IModel[]
  >(
    async () => {
      if (!isAdminScope) {
        return [];
      }
      const service = await getModelsService();
      // Fetch all models with a large limit to find defaults
      const allModels: IModel[] = await service.findAll({ limit: 500 });
      // Instantiate Model class for each item to enable getter methods
      return allModels.map((m) => new Model(m));
    },
    {
      defaultValue: [],
      dependencies: [],
      enabled: isAdminScope,
      onError: (error: any) => {
        logger.error('Failed to load default models', error);
      },
    },
  );

  // Process default models for admin cards
  const defaultModels = useMemo(() => {
    if (!isAdminScope || !defaultModelsData) {
      return {};
    }
    const defaults: {
      image?: IModel;
      video?: IModel;
      music?: IModel;
      text?: IModel;
    } = {};
    for (const model of defaultModelsData) {
      if (model.isDefault) {
        if (model.category === ModelCategory.IMAGE) {
          defaults.image = model;
        } else if (model.category === ModelCategory.VIDEO) {
          defaults.video = model;
        } else if (model.category === ModelCategory.MUSIC) {
          defaults.music = model;
        } else if (model.category === ModelCategory.TEXT) {
          defaults.text = model;
        }
      }
    }
    return defaults;
  }, [isAdminScope, defaultModelsData]);

  // Transform default models to StatsCards format (admin only)
  const defaultModelCards = useMemo(() => {
    if (!isAdminScope) {
      return [];
    }

    const allCards = [
      {
        categoryMatch: 'image',
        colorClass: 'bg-purple-500/20 text-purple-400',
        count: 0,
        description: defaultModels.image?.label || 'Not set',
        icon: HiPhoto,
        label: 'Image',
      },
      {
        categoryMatch: 'video',
        colorClass: 'bg-blue-500/20 text-blue-400',
        count: 0,
        description: defaultModels.video?.label || 'Not set',
        icon: HiFilm,
        label: 'Video',
      },
      {
        categoryMatch: 'music',
        colorClass: 'bg-amber-500/20 text-amber-400',
        count: 0,
        description: defaultModels.music?.label || 'Not set',
        icon: HiMusicalNote,
        label: 'Music',
      },
      {
        categoryMatch: 'text',
        colorClass: 'bg-green-500/20 text-green-400',
        count: 0,
        description: defaultModels.text?.label || 'Not set',
        icon: HiDocumentText,
        label: 'Text',
      },
    ];

    // Add opacity to card if it doesn't match the active category
    return allCards.map((card) => {
      const isActiveCategory =
        category === 'all' ||
        category === card.categoryMatch ||
        (category === 'other' && card.categoryMatch === 'text');

      return {
        cardClassName: isActiveCategory ? undefined : 'opacity-50',
        colorClass: card.colorClass,
        count: card.count,
        description: card.description,
        icon: card.icon,
        label: card.label,
      };
    });
  }, [isAdminScope, category, defaultModels]);

  // Mark component as mounted after first render
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // Register refresh function with context
  useEffect(() => {
    if (!onRefreshRegister) {
      return;
    }

    // Register the async refresh function
    onRefreshRegister(refresh);

    // Cleanup on unmount
    return () => {
      onRefreshRegister(null);
    };
  }, [refresh, onRefreshRegister]);

  const isModelEnabled = useCallback(
    (modelId: string): boolean => {
      // Admin scope doesn't use organization settings
      if (isAdminScope) {
        return true;
      }

      // Normalize modelId to string and trim
      const normalizedModelId = String(modelId || '').trim();
      if (!normalizedModelId) {
        return false;
      }

      // Strict mode: if no settings or empty enabledModels array, no models are enabled
      if (!settings?.enabledModels || settings.enabledModels.length === 0) {
        return false;
      }

      // Normalize enabledModels array items and check for match
      return settings.enabledModels.some(
        (enabledId) => String(enabledId || '').trim() === normalizedModelId,
      );
    },
    [isAdminScope, settings],
  );

  const filteredModels = useMemo(() => {
    if (!models) {
      return [];
    }
    const searchTerm = filters?.search?.toLowerCase() || '';

    return models.filter(
      (m) =>
        m.label?.toLowerCase().includes(searchTerm) ||
        m.description?.toLowerCase().includes(searchTerm) ||
        m.key?.toLowerCase().includes(searchTerm) ||
        m.provider?.toLowerCase().includes(searchTerm),
    );
  }, [models, filters?.search]);

  // Helper to check if a model is the only default in its category (admin only)
  const isOnlyDefaultInCategory = useCallback(
    (model: IModel): boolean => {
      if (!isAdminScope || !model.isDefault) {
        return false;
      }
      // Don't disable if model is inactive - inactive defaults shouldn't block toggling
      if (!model.isActive) {
        return false;
      }

      const otherDefaultsInCategory = models.filter(
        (m) =>
          m.id !== model.id &&
          m.category === model.category &&
          m.isDefault &&
          m.isActive, // Only count active models
      );

      return otherDefaultsInCategory.length === 0;
    },
    [isAdminScope, models],
  );

  // Admin toggle handler (isActive/isDefault)
  const handleAdminToggle = useCallback(
    async (model: IModel, field: 'isActive' | 'isDefault') => {
      if (!model.id) {
        return;
      }

      // Prevent multiple simultaneous toggles for the same model
      if (togglingModelId === model.id) {
        return;
      }

      setTogglingModelId(model.id);

      const service = await getModelsService();
      const url = `PATCH /models/${model.id}`;
      const newValue = !model[field];

      try {
        await service.patch(model.id, {
          ...model,
          [field]: newValue,
        });

        // Optimistic update
        const updatedModels = models.map((m) => {
          if (m.id === model.id) {
            return new Model({ ...m, [field]: newValue });
          }
          // If setting isDefault to true, clear other defaults in same category
          if (
            field === 'isDefault' &&
            newValue &&
            m.category === model.category
          ) {
            return new Model({ ...m, isDefault: false });
          }
          return m;
        });
        setModels(updatedModels);

        // Refresh to get updated default models
        await handleRefresh();

        notificationsService.success(
          `Model ${field === 'isActive' ? 'activation' : 'default status'} updated`,
        );
      } catch (error: unknown) {
        logger.error(`${url} failed`, error);
        const errorDetails = ErrorHandler.extractErrorDetails(error);
        notificationsService.error(
          errorDetails.message || 'Failed to update model',
        );
        // Refresh on error to revert optimistic update
        await handleRefresh();
      } finally {
        setTogglingModelId(null);
      }
    },
    [
      getModelsService,
      handleRefresh,
      notificationsService,
      togglingModelId,
      setModels,
      models,
    ],
  );

  // Organization toggle handler (enabled/disabled for org)
  const handleToggleModel = useCallback(
    async (model: IModel, enabled: boolean) => {
      if (!organizationId || !model.id || isAdminScope) {
        return;
      }

      // Prevent multiple simultaneous toggles for the same model
      if (togglingModelId === model.id) {
        return;
      }

      setTogglingModelId(model.id);

      try {
        const service = await getOrganizationsService();
        await service.toggleModel(organizationId, model.id, enabled);
        logger.info(
          `PATCH /organizations/${organizationId}/settings/models/${model.id} success`,
        );

        // Refresh both settings and models list to ensure UI is in sync
        await Promise.all([refreshSettings(), handleRefresh()]);
      } catch (error: unknown) {
        logger.error(
          `PATCH /organizations/${organizationId}/settings/models/${model.id} failed`,
          error,
        );
        const errorDetails = ErrorHandler.extractErrorDetails(error);
        notificationsService.error(
          errorDetails.message || 'Failed to update model availability',
        );
      } finally {
        setTogglingModelId(null);
      }
    },
    [
      organizationId,
      getOrganizationsService,
      refreshSettings,
      handleRefresh,
      notificationsService,
      togglingModelId,
      isAdminScope,
    ],
  );

  // Admin delete handler
  const handleDelete = useCallback(async () => {
    if (!selectedModel?.id) {
      return;
    }
    const url = `DELETE /models/${selectedModel.id}`;
    try {
      const service = await getModelsService();
      await service.delete(selectedModel.id);
      await handleRefresh();
      notificationsService.success('Model deleted successfully');
      setSelectedModel(undefined);
    } catch (error) {
      logger.error(`${url} failed`, error);
      notificationsService.error('Failed to delete model');
    }
  }, [selectedModel, getModelsService, handleRefresh, notificationsService]);

  const columns: TableColumn<IModel>[] = useMemo(
    () => [
      { header: 'Label', key: 'label' },
      {
        className: 'truncate max-w-40',
        header: 'Description',
        key: 'description',
        render: (model: IModel) => model.description || '-',
      },
      ...(isAdminScope
        ? [
            { className: 'font-mono text-sm', header: 'Key', key: 'key' },
            {
              header: 'Provider',
              key: 'provider',
              render: (model: IModel) => (
                <Badge
                  className={`text-xs uppercase ${model.providerBadgeClass}`}
                >
                  {model.provider}
                </Badge>
              ),
            },
          ]
        : []),
      {
        header: 'Category',
        key: 'category',
        render: (model: IModel) => (
          <Badge className={`text-xs uppercase ${model.categoryBadgeClass}`}>
            {model.category}
          </Badge>
        ),
      },
      {
        header: 'Value',
        key: 'cost',
        render: (val: IModel) => {
          const tier = val.costTier || 'low';
          const tierLabel =
            tier === 'high' ? 'Best' : tier === 'medium' ? 'Better' : 'Good';
          const tierClass =
            tier === 'high'
              ? 'bg-emerald-500/20 text-emerald-400'
              : tier === 'medium'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-foreground/10 text-foreground/70';
          return <Badge className={`text-xs ${tierClass}`}>{tierLabel}</Badge>;
        },
      },
      ...(isAdminScope
        ? [
            {
              header: 'Active',
              key: 'isActive',
              render: (model: IModel) => (
                <Switch
                  isChecked={model.isActive}
                  isDisabled={
                    model.isActive && isOnlyDefaultInCategory(model)
                      ? true
                      : togglingModelId === model.id
                  }
                  onChange={() => handleAdminToggle(model, 'isActive')}
                />
              ),
            },
            {
              header: 'Default',
              key: 'isDefault',
              render: (model: IModel) => (
                <Switch
                  isChecked={model.isDefault}
                  isDisabled={
                    !!(
                      !model.isActive ||
                      isOnlyDefaultInCategory(model) ||
                      togglingModelId === model.id
                    )
                  }
                  onChange={() => handleAdminToggle(model, 'isDefault')}
                />
              ),
            },
          ]
        : [
            {
              header: '',
              key: 'enabled',
              render: (model: IModel) => {
                const isEnabled = isModelEnabled(model.id);
                const isToggling = togglingModelId === model.id;

                return (
                  <Switch
                    isChecked={isEnabled}
                    onChange={() => handleToggleModel(model, !isEnabled)}
                    isDisabled={isToggling || model.isDefault}
                  />
                );
              },
            },
          ]),
    ],
    [
      isAdminScope,
      isModelEnabled,
      isOnlyDefaultInCategory,
      handleAdminToggle,
      handleToggleModel,
      togglingModelId,
    ],
  );

  // Open model details modal
  const handleViewDetails = useCallback((model: IModel) => {
    setSelectedModel(model);
    openModal(ModalEnum.MODEL);
  }, []);

  // Actions - info button for all users, delete for admin only
  const actions: TableAction<IModel>[] = useMemo(
    () => [
      {
        icon: <HiInformationCircle />,
        onClick: handleViewDetails,
        tooltip: 'View Details',
      },
      ...(isAdminScope
        ? [
            {
              icon: <HiTrash />,
              onClick: (model: IModel) => {
                setSelectedModel(model);
                openConfirm({
                  confirmLabel: 'Delete',
                  isError: true,
                  label: 'Delete Model',
                  message: `Are you sure you want to delete "${model.label}"? This action cannot be undone.`,
                  onConfirm: handleDelete,
                });
              },
              tooltip: 'Delete',
            },
          ]
        : []),
    ],
    [isAdminScope, handleViewDetails, openConfirm, handleDelete],
  );

  return (
    <>
      {isAdminScope && (
        <>
          <div className="mb-4">
            <AdminOrgBrandFilter
              organization={adminOrg}
              brand={adminBrand}
              onOrganizationChange={handleAdminOrgChange}
              onBrandChange={handleAdminBrandChange}
            />
          </div>
          <StatsCards items={defaultModelCards} isLoading={isLoadingDefaults} />
        </>
      )}

      <AppTable<IModel>
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={(model: IModel) => model.id}
        emptyLabel="No models found"
        items={filteredModels}
      />

      {/* Model details modal - view mode for non-admin, edit mode for admin */}
      <LazyModalModel
        entity={selectedModel}
        mode={isAdminScope ? 'edit' : 'view'}
        onConfirm={() => {
          // Delay clearing to allow modal close animation to complete
          setTimeout(() => setSelectedModel(undefined), 150);
          refresh();
        }}
        onClose={() => {
          // Delay clearing to allow modal close animation to complete
          setTimeout(() => setSelectedModel(undefined), 150);
        }}
      />

      {!isLoading && (
        <div className="mt-4">
          <AutoPagination showTotal totalLabel="models" />
        </div>
      )}
    </>
  );
}
