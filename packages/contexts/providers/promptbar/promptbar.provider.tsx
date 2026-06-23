'use client';

import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { IngredientCategory } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type {
  IFontFamily,
  IModel,
  IPreset,
  ITag,
  ITraining,
} from '@genfeedai/interfaces';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import { ModelsService } from '@genfeedai/services/ai/models.service';
import { TrainingsService } from '@genfeedai/services/ai/trainings.service';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { FontFamiliesService } from '@genfeedai/services/elements/font-families.service';
import { PresetsService } from '@genfeedai/services/elements/presets.service';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  PromptBarContext,
  type PromptBarContextValue,
} from './promptbar.context';

function PromptBarProviderContent({
  children,
  enabled,
}: LayoutProps & { enabled: boolean }): ReactNode {
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    userId,
    orgId,
  } = useAuthIdentity();
  const { organizationId, settings: orgSettings } = useBrand();

  const getFontFamiliesService = useAuthedService(
    useCallback((token: string) => FontFamiliesService.getInstance(token), []),
  );

  const getPresetsService = useAuthedService(
    useCallback((token: string) => PresetsService.getInstance(token), []),
  );

  const getModelsService = useAuthedService(
    useCallback((token: string) => ModelsService.getInstance(token), []),
  );

  const getTrainingsService = useAuthedService(
    useCallback((token: string) => TrainingsService.getInstance(token), []),
  );

  const getTagsService = useAuthedService(
    useCallback((token: string) => TagsService.getInstance(token), []),
  );

  const [allModels, setAllModels] = useState<
    (IModel & { isTraining: boolean })[]
  >([]);
  const [presets, setPresets] = useState<IPreset[]>([]);
  const [fontFamilies, setFontFamilies] = useState<IFontFamily[]>([]);
  const [tags, setTags] = useState<ITag[]>([]);
  const [trainings, setTrainings] = useState<ITraining[]>([]);

  const [error, setError] = useState<Error | null>(null);
  const refreshCallbacksRef = useRef<(() => void)[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const isLoadingRef = useRef(false);
  const fetchIdRef = useRef(0);

  const lastSessionRef = useRef<{
    userId: string | null;
    orgId: string | null;
    organizationId: string | null;
  }>({
    organizationId: null,
    orgId: null,
    userId: null,
  });

  /* eslint-disable react-doctor/no-adjust-state-on-prop-change -- Async provider resource loading updates state from fetch lifecycle callbacks, not prop mirroring. */
  const findAllPromptBarData = useCallback(async () => {
    if (!isSignedIn || !enabled) {
      return;
    }

    const currentFetchId = ++fetchIdRef.current;

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const [
        fontFamiliesService,
        presetsService,
        modelsService,
        trainingsService,
        tagsService,
      ] = await Promise.all([
        getFontFamiliesService(),
        getPresetsService(),
        getModelsService(),
        getTrainingsService(),
        getTagsService(),
      ]);

      const query = { limit: ITEMS_PER_PAGE, pagination: false };
      const dataPromises: Promise<unknown>[] = [
        fontFamiliesService.findAll(query),
        presetsService.findAll(query),
        modelsService.findAll({ ...query, isActive: true }),
        trainingsService.findAll({
          ...query,
          isActive: true,
          status: 'completed',
        }),
        tagsService.findAll({
          ...query,
          isActive: true,
        }),
      ];

      if (currentFetchId !== fetchIdRef.current) {
        logger.info('PromptBar fetch superseded, discarding stale results', {
          currentFetchId: fetchIdRef.current,
          fetchId: currentFetchId,
        });
        return;
      }

      const results = await Promise.all(dataPromises);

      const fontFamiliesData = results[0] as IFontFamily[];
      const presetsData = results[1] as IPreset[];
      const modelsData = results[2] as IModel[];
      const trainingsData = results[3] as ITraining[];
      const tagsData = results[4] as ITag[];

      logger.info('PromptBar data loaded', {
        enabledModels: orgSettings?.enabledModels?.length ?? 'N/A',
        fontFamilies: fontFamiliesData.length,
        models: modelsData.length,
        presets: presetsData.length,
        tags: tagsData.length,
        trainings: trainingsData.length,
      });

      const trainingModels: (IModel & { isTraining: boolean })[] =
        trainingsData.map(
          (t) =>
            ({
              category: IngredientCategory.IMAGE,
              cost: 5,
              createdAt: t.createdAt,
              description: t.description,
              id: t.id,
              isActive: true,
              isDefault: false,
              isDeleted: false,
              isHighlighted: false,
              isTraining: true,
              key: String(t.model),
              label: t.label,
              provider: 'replicate',
              trigger: t.trigger,
              updatedAt: t.updatedAt,
            }) as unknown as IModel & { isTraining: boolean },
        );

      const modelsWithTrainingFlag = modelsData.map(
        (m) =>
          ({ ...m, isTraining: false }) as IModel & { isTraining: boolean },
      );

      setFontFamilies(fontFamiliesData);
      setPresets(presetsData);
      setAllModels([...modelsWithTrainingFlag, ...trainingModels]);
      setTags(tagsData);
      setTrainings(trainingsData);
      lastSessionRef.current = { organizationId, orgId, userId };
    } catch (err) {
      if (currentFetchId === fetchIdRef.current) {
        logger.error('Failed to load PromptBar data', err);
        setError(
          err instanceof Error
            ? err
            : new Error('Failed to load PromptBar data'),
        );
      }
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [
    isSignedIn,
    enabled,
    userId,
    orgId,
    organizationId,
    getFontFamiliesService,
    getPresetsService,
    getModelsService,
    getTrainingsService,
    getTagsService,
    orgSettings,
  ]);
  /* eslint-enable react-doctor/no-adjust-state-on-prop-change */

  useEffect(() => {
    if (!isAuthLoaded || !enabled) {
      return;
    }

    if (!isSignedIn) {
      lastSessionRef.current = {
        organizationId: null,
        orgId: null,
        userId: null,
      };
      isLoadingRef.current = false;
      return;
    }

    const sessionChanged =
      lastSessionRef.current.userId !== (userId ?? null) ||
      lastSessionRef.current.orgId !== (orgId ?? null) ||
      lastSessionRef.current.organizationId !== (organizationId ?? null);

    if (sessionChanged) {
      void findAllPromptBarData();
    }
  }, [
    isAuthLoaded,
    isSignedIn,
    enabled,
    userId,
    orgId,
    organizationId,
    findAllPromptBarData,
  ]);

  const refetch = useCallback(async () => {
    lastSessionRef.current = {
      organizationId: null,
      orgId: null,
      userId: null,
    };
    await findAllPromptBarData();
    refreshCallbacksRef.current.forEach((callback) => {
      callback();
    });
  }, [findAllPromptBarData]);

  const onRefresh = useCallback((callback: () => void) => {
    refreshCallbacksRef.current.push(callback);
    return () => {
      refreshCallbacksRef.current = refreshCallbacksRef.current.filter(
        (cb) => cb !== callback,
      );
    };
  }, []);

  const hasActiveSession = enabled && isSignedIn;
  const exposedIsLoading =
    enabled && !isAuthLoaded ? true : hasActiveSession ? isLoading : false;

  const models = useMemo(() => {
    if (exposedIsLoading || !hasActiveSession) {
      return [];
    }

    if (organizationId && !orgSettings) {
      return [];
    }

    if (!organizationId) {
      return allModels;
    }

    const enabledModels = orgSettings?.enabledModels;
    if (!enabledModels || enabledModels.length === 0) {
      return [];
    }

    return allModels.filter(
      (model) =>
        model.isTraining ||
        enabledModels.includes(model.id) ||
        enabledModels.includes(model.key),
    );
  }, [
    allModels,
    orgSettings,
    exposedIsLoading,
    hasActiveSession,
    organizationId,
  ]);

  const value: PromptBarContextValue = {
    error: hasActiveSession ? error : null,
    fontFamilies: hasActiveSession ? fontFamilies : [],
    isLoading: exposedIsLoading,
    models,
    onRefresh,
    presets: hasActiveSession ? presets : [],
    refetch,
    tags: hasActiveSession ? tags : [],
    trainings: hasActiveSession ? trainings : [],
  };

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
