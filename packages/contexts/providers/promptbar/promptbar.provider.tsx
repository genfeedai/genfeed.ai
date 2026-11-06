'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { IngredientCategory } from '@genfeedai/contracts';
import type {
  IFontFamily,
  IModel,
  IPreset,
  ITag,
  ITraining,
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@genfeedai/hooks/auth/use-authed-query/use-authed-query';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { ModelsService } from '@genfeedai/services/ai/models.service';
import { TrainingsService } from '@genfeedai/services/ai/trainings.service';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { FontFamiliesService } from '@genfeedai/services/elements/font-families.service';
import { PresetsService } from '@genfeedai/services/elements/presets.service';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import {
  PromptBarContext,
  type PromptBarContextValue,
} from './promptbar.context';

type PromptBarModel = IModel & { isTraining: boolean };

interface PromptBarCatalogs {
  fontFamilies: IFontFamily[];
  models: PromptBarModel[];
  presets: IPreset[];
  tags: ITag[];
  trainings: ITraining[];
}

interface PromptBarCatalogServices {
  fontFamilies: FontFamiliesService;
  models: ModelsService;
  presets: PresetsService;
  tags: TagsService;
  trainings: TrainingsService;
}

const EMPTY_MODELS: PromptBarModel[] = [];
const EMPTY_FONT_FAMILIES: IFontFamily[] = [];
const EMPTY_PRESETS: IPreset[] = [];
const EMPTY_TAGS: ITag[] = [];
const EMPTY_TRAININGS: ITraining[] = [];

function createPromptBarCatalogServices(
  token: string,
): PromptBarCatalogServices {
  return {
    fontFamilies: FontFamiliesService.getInstance(token),
    models: ModelsService.getInstance(token),
    presets: PresetsService.getInstance(token),
    tags: TagsService.getInstance(token),
    trainings: TrainingsService.getInstance(token),
  };
}

function toTrainingModel(training: ITraining): PromptBarModel {
  return {
    category: IngredientCategory.IMAGE,
    cost: 5,
    createdAt: training.createdAt,
    description: training.description,
    id: training.id,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    isHighlighted: false,
    isTraining: true,
    key: String(training.model),
    label: training.label,
    provider: 'replicate',
    trigger: training.trigger,
    updatedAt: training.updatedAt,
  } as unknown as PromptBarModel;
}

/**
 * Every picker in the prompt bar lists its full catalog, and HTTP list
 * endpoints are always paginated — walk the pages instead of relying on the
 * ignored `pagination: false`.
 */
async function loadPromptBarCatalogs(
  services: PromptBarCatalogServices,
  signal: AbortSignal,
): Promise<PromptBarCatalogs> {
  try {
    const [fontFamilies, presets, models, trainings, tags] = await Promise.all([
      services.fontFamilies.findAllPages({}, signal),
      services.presets.findAllPages({}, signal),
      services.models.findAllPages({ isActive: true }, signal),
      services.trainings.findAllPages(
        { isActive: true, status: 'completed' },
        signal,
      ),
      services.tags.findAllPages({ isActive: true }, signal),
    ]);

    logger.debug('PromptBar data loaded', {
      fontFamilies: fontFamilies.length,
      models: models.length,
      presets: presets.length,
      tags: tags.length,
      trainings: trainings.length,
    });

    return {
      fontFamilies,
      models: [
        ...models.map((model) => ({ ...model, isTraining: false })),
        ...trainings.map(toTrainingModel),
      ],
      presets,
      tags,
      trainings,
    };
  } catch (err) {
    if (!signal.aborted) {
      logger.error('Failed to load PromptBar data', err);
    }
    throw err;
  }
}

function PromptBarProviderContent({
  children,
  enabled,
}: LayoutProps & { enabled: boolean }): ReactNode {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuthIdentity();
  const { organizationId, settings: orgSettings } = useBrand();

  const refreshCallbacksRef = useRef<(() => void)[]>([]);

  // The catalogs are large and only a few screens read them, so nothing is
  // fetched until a consumer mounts and calls `requestLoad`.
  const [hasDemand, setHasDemand] = useState(false);
  const requestLoad = useCallback(() => setHasDemand(true), []);

  const hasActiveSession = enabled && Boolean(isSignedIn);

  // Cached per organization (and viewer): reopening a screen with a picker
  // paints the catalogs at once and refreshes them in the background.
  const catalogsQuery = useAuthedQuery<
    PromptBarCatalogServices,
    PromptBarCatalogs
  >({
    enabled: Boolean(isAuthLoaded) && hasActiveSession && hasDemand,
    queryFn: loadPromptBarCatalogs,
    queryKey: ['prompt-bar-catalogs', organizationId || null],
    service: createPromptBarCatalogServices,
  });
  const {
    data: catalogs,
    error: catalogsError,
    isFetching,
    isPending,
    refetch: refetchCatalogs,
  } = catalogsQuery;
  const hasCatalogs = catalogs !== undefined;
  const isCatalogLoading = !hasCatalogs && (isPending || isFetching);
  // A failed background refresh keeps the loaded catalogs and reports nothing.
  const error = !hasCatalogs && !isFetching ? catalogsError : null;
  const allModels = catalogs?.models ?? EMPTY_MODELS;

  const refetch = useCallback(async () => {
    if (hasActiveSession) {
      await refetchCatalogs();
    }
    refreshCallbacksRef.current.forEach((callback) => {
      callback();
    });
  }, [hasActiveSession, refetchCatalogs]);

  const onRefresh = useCallback((callback: () => void) => {
    refreshCallbacksRef.current.push(callback);
    return () => {
      refreshCallbacksRef.current = refreshCallbacksRef.current.filter(
        (cb) => cb !== callback,
      );
    };
  }, []);

  const exposedIsLoading =
    enabled && !isAuthLoaded
      ? true
      : hasActiveSession
        ? isCatalogLoading
        : false;

  const models = useMemo(() => {
    if (exposedIsLoading || !hasActiveSession) {
      return EMPTY_MODELS;
    }

    if (organizationId && !orgSettings) {
      return EMPTY_MODELS;
    }

    if (!organizationId) {
      return allModels;
    }

    const enabledModelIds = orgSettings?.enabledModelIds;
    if (!enabledModelIds || enabledModelIds.length === 0) {
      return EMPTY_MODELS;
    }

    return allModels.filter(
      (model) =>
        model.isTraining ||
        enabledModelIds.includes(model.id) ||
        enabledModelIds.includes(model.key),
    );
  }, [
    allModels,
    orgSettings,
    exposedIsLoading,
    hasActiveSession,
    organizationId,
  ]);

  const value = useMemo<PromptBarContextValue>(
    () => ({
      error: hasActiveSession ? error : null,
      fontFamilies: hasActiveSession
        ? (catalogs?.fontFamilies ?? EMPTY_FONT_FAMILIES)
        : EMPTY_FONT_FAMILIES,
      isLoading: exposedIsLoading,
      models,
      onRefresh,
      presets: hasActiveSession
        ? (catalogs?.presets ?? EMPTY_PRESETS)
        : EMPTY_PRESETS,
      refetch,
      requestLoad,
      tags: hasActiveSession ? (catalogs?.tags ?? EMPTY_TAGS) : EMPTY_TAGS,
      trainings: hasActiveSession
        ? (catalogs?.trainings ?? EMPTY_TRAININGS)
        : EMPTY_TRAININGS,
    }),
    [
      catalogs,
      error,
      exposedIsLoading,
      hasActiveSession,
      models,
      onRefresh,
      refetch,
      requestLoad,
    ],
  );

  return (
    <PromptBarContext.Provider value={value}>
      {children}
    </PromptBarContext.Provider>
  );
}

export default function PromptBarProvider({
  children,
  enabled = true,
}: LayoutProps & { enabled?: boolean }): ReactNode {
  return (
    <PromptBarProviderContent enabled={enabled}>
      {children}
    </PromptBarProviderContent>
  );
}
