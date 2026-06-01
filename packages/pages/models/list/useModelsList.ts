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
import { Model } from '@models/ai/model.model';
import { useConfirmModal } from '@providers/global-modals/global-modals.provider';
import { ModelsService } from '@services/ai/models.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorHandler } from '@utils/error/error-handler.util';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildModelsTableColumns } from './components/ModelsTableColumns';
import {
  buildDefaultModelCards,
  buildDefaultModelMap,
} from './components/models-admin-header.helpers';

export function useModelsList({
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

  const queryClient = useQueryClient();

  // Fetch organization settings to get enabled models (only for non-admin scopes)
  const settingsQueryKey = [
    'studio-models-settings',
    organizationId,
    isAdminScope,
  ] as const;
  const {
    data: settings,
    refetch: refreshSettings,
    error: settingsError,
  } = useQuery<IOrganizationSetting | null>({
    enabled: !isAdminScope && !!organizationId,
    queryFn: async () => {
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
    queryKey: settingsQueryKey,
  });

  useEffect(() => {
    if (settingsError instanceof Error) {
      logger.error(
        `GET /organizations/${organizationId}/settings failed`,
        settingsError,
      );
    }
  }, [settingsError, organizationId]);

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
  const modelsQueryKey = [
    'studio-models',
    categoryFilter,
    currentPage,
    isAdminScope,
    adminOrg,
    adminBrand,
  ] as const;

  const {
    data: models = [],
    isLoading,
    refetch: refetchModels,
    error: modelsError,
  } = useQuery<IModel[]>({
    queryFn: async () => {
      const service = await getModelsService();
      const query: Record<string, unknown> = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        sort: 'label: 1',
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
    queryKey: modelsQueryKey,
  });

  useEffect(() => {
    if (modelsError instanceof Error) {
      logger.error('GET /models failed', modelsError);
    }
  }, [modelsError]);

  const setModels = useCallback(
    (updatedModels: IModel[]) => {
      queryClient.setQueryData(modelsQueryKey, updatedModels);
    },
    [queryClient, modelsQueryKey],
  );

  const refresh = useCallback(async () => {
    await refetchModels();
  }, [refetchModels]);

  // Fetch default models for admin cards
  const {
    data: defaultModelsData = [],
    isLoading: isLoadingDefaults,
    error: defaultModelsError,
  } = useQuery<IModel[]>({
    enabled: isAdminScope,
    queryFn: async () => {
      if (!isAdminScope) {
        return [];
      }
      const service = await getModelsService();
      // Fetch all models with a large limit to find defaults
      const allModels: IModel[] = await service.findAll({ limit: 500 });
      // Instantiate Model class for each item to enable getter methods
      return allModels.map((m) => new Model(m));
    },
    queryKey: ['studio-models-defaults'],
  });

  useEffect(() => {
    if (defaultModelsError instanceof Error) {
      logger.error('Failed to load default models', defaultModelsError);
    }
  }, [defaultModelsError]);

  // Process default models for admin cards
  const defaultModels = useMemo(
    () =>
      isAdminScope && defaultModelsData
        ? buildDefaultModelMap(defaultModelsData)
        : {},
    [isAdminScope, defaultModelsData],
  );

  // Transform default models to StatsCards format (admin only)
  const defaultModelCards = useMemo(
    () => (isAdminScope ? buildDefaultModelCards(defaultModels, category) : []),
    [isAdminScope, category, defaultModels],
  );

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

  const handleApproveRegistryModel = useCallback(
    async (model: IModel) => {
      if (!model.id) {
        return;
      }

      const url = `PATCH /models/${model.id}/approve`;
      try {
        const service = await getModelsService();
        await service.approveRegistryModel(model.id, {
          label: model.label,
        });
        await handleRefresh();
        notificationsService.success('Model approved');
      } catch (error) {
        logger.error(`${url} failed`, error);
        const errorDetails = ErrorHandler.extractErrorDetails(error);
        notificationsService.error(
          errorDetails.message || 'Failed to approve model',
        );
      }
    },
    [getModelsService, handleRefresh, notificationsService],
  );

  const handleRejectRegistryModel = useCallback(
    async (model: IModel) => {
      if (!model.id) {
        return;
      }

      const url = `PATCH /models/${model.id}/reject`;
      try {
        const service = await getModelsService();
        await service.rejectRegistryModel(
          model.id,
          'Rejected from model registry review',
        );
        await handleRefresh();
        notificationsService.success('Model rejected');
      } catch (error) {
        logger.error(`${url} failed`, error);
        const errorDetails = ErrorHandler.extractErrorDetails(error);
        notificationsService.error(
          errorDetails.message || 'Failed to reject model',
        );
      }
    },
    [getModelsService, handleRefresh, notificationsService],
  );

  const handleMarkRegistryModelLegacy = useCallback(
    async (model: IModel) => {
      if (!model.id) {
        return;
      }

      const url = `PATCH /models/${model.id}/legacy`;
      try {
        const service = await getModelsService();
        await service.markRegistryModelLegacy(model.id);
        await handleRefresh();
        notificationsService.success('Model marked legacy');
      } catch (error) {
        logger.error(`${url} failed`, error);
        const errorDetails = ErrorHandler.extractErrorDetails(error);
        notificationsService.error(
          errorDetails.message || 'Failed to mark model legacy',
        );
      }
    },
    [getModelsService, handleRefresh, notificationsService],
  );

  const columns = useMemo(
    () =>
      buildModelsTableColumns({
        isAdminScope,
        isModelEnabled,
        isOnlyDefaultInCategory,
        handleAdminToggle,
        handleToggleModel,
        togglingModelId,
      }),
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

  return {
    isAdminScope,
    adminOrg,
    adminBrand,
    handleAdminOrgChange,
    handleAdminBrandChange,
    defaultModelCards,
    isLoadingDefaults,
    isLoading,
    columns,
    filteredModels,
    selectedModel,
    setSelectedModel,
    refresh,
    handleViewDetails,
    handleDelete,
    handleApproveRegistryModel,
    handleRejectRegistryModel,
    handleMarkRegistryModelLegacy,
    openConfirm,
  };
}
