'use client';

import { useAuth } from '@clerk/nextjs';
import type {
  IFontFamily,
  IModel,
  IPreset,
  ITag,
  ITraining,
} from '@genfeedai/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { IngredientCategory } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { LayoutProps } from '@props/layout/layout.props';
import { ModelsService } from '@services/ai/models.service';
import { TrainingsService } from '@services/ai/trainings.service';
import { TagsService } from '@services/content/tags.service';
import { logger } from '@services/core/logger.service';
import { FontFamiliesService } from '@services/elements/font-families.service';
import { PresetsService } from '@services/elements/presets.service';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface PromptBarContextValue {
  models: IModel[];
  presets: IPreset[];
  fontFamilies: IFontFamily[];
  tags: ITag[];
  trainings: ITraining[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  onRefresh?: (callback: () => void) => void;
}

export const PromptBarContext = createContext<
  PromptBarContextValue | undefined
>(undefined);

export function usePromptBarContext(): PromptBarContextValue {
  const context = useContext(PromptBarContext);
  if (context === undefined) {
    throw new Error(
      'usePromptBarContext must be used within a PromptBarProvider',
    );
  }
  return context;
}

function PromptBarProviderContent({
  children,
  enabled,
}: LayoutProps & { enabled: boolean }): ReactNode {
  const { isLoaded: isAuthLoaded, isSignedIn, userId, orgId } = useAuth();
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

      const results = await Promise.all(dataPromises);

      const fontFamiliesData = results[0] as IFontFamily[];
      const presetsData = results[1] as IPreset[];
      const modelsData = results[2] as IModel[];
      const trainingsData = results[3] as ITraining[];
      const tagsData = results[4] as ITag[];

      if (currentFetchId !== fetchIdRef.current) {
        logger.info('PromptBar fetch superseded, discarding stale results', {
          currentFetchId: fetchIdRef.current,
          fetchId: currentFetchId,
        });
        return;
      }

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

  useEffect(() => {
    if (!isAuthLoaded || !enabled) {
      return;
    }

    if (!isSignedIn) {
      setAllModels([]);
      setPresets([]);
      setFontFamilies([]);
      setTags([]);
      setTrainings([]);
      lastSessionRef.current = {
        organizationId: null,
        orgId: null,
        userId: null,
      };
      isLoadingRef.current = false;
      setIsLoading(false);
      return setError(null);
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
    refreshCallbacksRef.current.forEach((callback) => callback());
  }, [findAllPromptBarData]);

  const onRefresh = useCallback((callback: () => void) => {
    refreshCallbacksRef.current.push(callback);
    return () => {
      refreshCallbacksRef.current = refreshCallbacksRef.current.filter(
        (cb) => cb !== callback,
      );
    };
  }, []);

  const models = useMemo(() => {
    if (isLoading) {
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
  }, [allModels, orgSettings, isLoading, organizationId]);

  const value: PromptBarContextValue = {
    error,
    fontFamilies,
    isLoading,
    models,
    onRefresh,
    presets,
    refetch,
    tags,
    trainings,
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
