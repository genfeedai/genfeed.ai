import type {
  ModelCapability,
  ModelUseCase,
  ProviderModel,
  ProviderType,
} from '@genfeedai/types';
import { useSettingsStore } from '@genfeedai/workflow-ui/stores';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface UseModelBrowserModalParams {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (model: ProviderModel) => void;
  capabilities?: ModelCapability[];
}

export function useModelBrowserModal({
  isOpen,
  onClose,
  onSelect,
  capabilities,
}: UseModelBrowserModalParams) {
  const recentModels = useSettingsStore((s) => s.recentModels);
  const addRecentModel = useSettingsStore((s) => s.addRecentModel);
  const replicateKey = useSettingsStore((s) => s.providers.replicate.apiKey);
  const falKey = useSettingsStore((s) => s.providers.fal.apiKey);
  const hfKey = useSettingsStore((s) => s.providers.huggingface.apiKey);

  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<ProviderType | 'all'>(
    'all',
  );
  const [useCaseFilter, setUseCaseFilter] = useState<ModelUseCase | 'all'>(
    'all',
  );
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<
    ProviderType[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchModels = useCallback(
    async (signal: AbortSignal) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();

        if (providerFilter !== 'all') {
          params.set('provider', providerFilter);
        }

        if (capabilities?.length) {
          params.set('capabilities', capabilities.join(','));
        }

        if (useCaseFilter !== 'all') {
          params.set('useCase', useCaseFilter);
        }

        if (searchQuery) {
          params.set('query', searchQuery);
        }

        const headers: Record<string, string> = {};
        if (replicateKey) {
          headers['X-Replicate-Key'] = replicateKey;
        }
        if (falKey) {
          headers['X-Fal-Key'] = falKey;
        }
        if (hfKey) {
          headers['X-HF-Key'] = hfKey;
        }

        const response = await fetch(
          `/v1/core/providers/models?${params.toString()}`,
          {
            headers,
            signal,
          },
        );

        if (response.ok) {
          const data = await response.json();
          setModels(data.models);
          setConfiguredProviders(data.configuredProviders);
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          logger.error('Failed to fetch models', {
            context: 'ModelBrowserModal',
            error,
          });
        }
      } finally {
        setIsLoading(false);
        setHasFetched(true);
      }
    },
    [
      searchQuery,
      providerFilter,
      useCaseFilter,
      capabilities,
      replicateKey,
      falKey,
      hfKey,
    ],
  );

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchModels(controller.signal);
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, fetchModels]);

  // Reset hasFetched when modal closes (adjusting state while rendering).
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setHasFetched(false);
    }
  }

  // Filter recent models by capabilities
  const filteredRecentModels = useMemo(() => {
    if (!capabilities?.length) return recentModels.slice(0, 4);

    return recentModels
      .filter((recent) => {
        const model = models.find(
          (m) => m.id === recent.id && m.provider === recent.provider,
        );
        if (!model) return true;
        return model.capabilities.some((c) => capabilities.includes(c));
      })
      .slice(0, 4);
  }, [recentModels, models, capabilities]);

  // Derive available use cases from loaded models
  const availableUseCases = useMemo(() => {
    const useCaseSet = new Set<ModelUseCase>();
    for (const model of models) {
      model.useCases?.forEach((uc) => {
        if (uc !== 'general') useCaseSet.add(uc);
      });
    }
    return Array.from(useCaseSet).sort();
  }, [models]);

  const handleSelect = useCallback(
    (model: ProviderModel) => {
      addRecentModel({
        displayName: model.displayName,
        id: model.id,
        provider: model.provider,
      });
      onSelect(model);
      onClose();
    },
    [addRecentModel, onSelect, onClose],
  );

  return {
    searchQuery,
    setSearchQuery,
    providerFilter,
    setProviderFilter,
    useCaseFilter,
    setUseCaseFilter,
    models,
    configuredProviders,
    isLoading,
    hasFetched,
    filteredRecentModels,
    availableUseCases,
    handleSelect,
  };
}
