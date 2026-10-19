'use client';

import {
  ComponentSize,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  GenerationStatusOption,
  GenerationView,
} from '@props/admin/generations.props';
import { ModelsService } from '@services/ai/models.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import AdminOrgBrandUrlFilter, {
  useAdminOrgBrandParams,
} from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AdminDownloadButton from '@ui/layout/admin-page-shell/AdminDownloadButton';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import FormSearchbar from '@ui/primitives/searchbar';
import { Image as ImageIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import GenerationDetailPanel from './generation-detail-panel';
import GenerationFilterDropdown from './generation-filter-dropdown';
import GenerationRow from './generation-row';
import {
  buildGenerationsCsv,
  toGenerationView,
  toPromptView,
} from './generation-view';

const GENERATION_SKELETON_KEYS = [
  'generation-skeleton-1',
  'generation-skeleton-2',
  'generation-skeleton-3',
  'generation-skeleton-4',
] as const;

/** Type filter value for prompts that never produced a generation. */
const PROMPT_ONLY_TYPE = 'prompt';

const MODEL_OPTIONS_LIMIT = 100;

function downloadCsv(rows: GenerationView[]): void {
  const url = URL.createObjectURL(
    new Blob([buildGenerationsCsv(rows)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'generations.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function GenerationsPageContent() {
  const t = useTranslations('pages.adminGenerations');
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString() ?? '';
  const params = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const { brand, organization } = useAdminOrgBrandParams();
  const currentPage = Number(params.get('page')) || 1;
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const model = params.get('model') ?? '';
  const search = params.get('q') ?? '';

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance('ingredients', token),
  );
  const getPromptsService = useAuthedService((token: string) =>
    PromptsService.getInstance(token),
  );
  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );
  const notificationsService = NotificationsService.getInstance();

  const [generations, setGenerations] = useState<GenerationView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [selected, setSelected] = useState<GenerationView | null>(null);
  const [modelOptions, setModelOptions] = useState<GenerationStatusOption[]>(
    [],
  );

  const isPromptOnly = type === PROMPT_ONLY_TYPE;

  const setParam = useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(searchParamsString);
      if (value) next.set(name, value);
      else next.delete(name);
      next.delete('page');
      const query = next.toString();
      replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, replace, searchParamsString],
  );

  const loadGenerations = useCallback(
    async (signal: AbortSignal) => {
      setIsLoading(true);
      setHasError(false);

      const query: Record<string, unknown> = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        sort: 'createdAt: -1',
      };
      if (organization) query.organizationId = organization;
      if (brand) query.brandId = brand;
      if (search) query.search = search;

      try {
        if (isPromptOnly) {
          const service = await getPromptsService();
          const fetched = await service.findAdminWithoutGeneration(
            query,
            signal,
          );
          if (signal.aborted) return;
          setGenerations(
            (Array.isArray(fetched) ? fetched : []).map(toPromptView),
          );
        } else {
          if (status) query.status = status;
          if (type) query.category = type;
          if (model) query.model = model;
          const service = await getIngredientsService();
          const fetched = await service.findAdminGenerationReviews(
            query,
            signal,
          );
          if (signal.aborted) return;
          setGenerations(
            (Array.isArray(fetched) ? fetched : []).map(toGenerationView),
          );
        }
      } catch (error) {
        if (signal.aborted) return;
        logger.error('Failed to load generations', error);
        setGenerations([]);
        setHasError(true);
        notificationsService.error(t('loadError'));
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    },
    [
      brand,
      currentPage,
      getIngredientsService,
      getPromptsService,
      isPromptOnly,
      model,
      notificationsService,
      organization,
      search,
      status,
      t,
      type,
    ],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadVersion is the explicit refresh and retry trigger
  useEffect(() => {
    const controller = new AbortController();
    void loadGenerations(controller.signal);
    return () => controller.abort();
  }, [loadGenerations, reloadVersion]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getModelsService();
        const models = await service.findAll(
          { limit: MODEL_OPTIONS_LIMIT, sort: 'label: 1' },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setModelOptions(
          models
            .filter((item) => item.key)
            .map((item) => ({
              label: item.label || item.key,
              value: item.key,
            })),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load model filter options', error);
        }
      }
    })();
    return () => controller.abort();
  }, [getModelsService]);

  const statusOptions = useMemo<GenerationStatusOption[]>(
    () => [
      { label: t('allStatuses'), value: '' },
      { label: t('statusGenerated'), value: IngredientStatus.GENERATED },
      { label: t('statusProcessing'), value: IngredientStatus.PROCESSING },
      { label: t('statusFailed'), value: IngredientStatus.FAILED },
    ],
    [t],
  );
  const typeOptions = useMemo<GenerationStatusOption[]>(
    () => [
      { label: t('allTypes'), value: '' },
      { label: t('typeImage'), value: IngredientCategory.IMAGE },
      { label: t('typeVideo'), value: IngredientCategory.VIDEO },
      { label: t('typeMusic'), value: IngredientCategory.MUSIC },
      { label: t('promptOnly'), value: PROMPT_ONLY_TYPE },
    ],
    [t],
  );
  const allModelOptions = useMemo<GenerationStatusOption[]>(() => {
    const known = modelOptions.some((option) => option.value === model);
    return [
      { label: t('allModels'), value: '' },
      ...(model && !known ? [{ label: model, value: model }] : []),
      ...modelOptions,
    ];
  }, [model, modelOptions, t]);

  const reload = useCallback(
    () => setReloadVersion((version) => version + 1),
    [],
  );

  return (
    <AdminPageShell
      title={t('title')}
      icon={ImageIcon}
      search={
        <div className="w-48 sm:w-64">
          <FormSearchbar
            ariaLabel={t('search')}
            onSearch={(value) => setParam('q', value.trim())}
            placeholder={t('search')}
            size={ComponentSize.SM}
            value={search}
          />
        </div>
      }
      filters={
        <>
          {isPromptOnly ? null : (
            <GenerationFilterDropdown
              label={t('filterStatus')}
              onChange={(value) => setParam('status', value)}
              options={statusOptions}
              value={status}
            />
          )}
          <GenerationFilterDropdown
            label={t('filterType')}
            onChange={(value) => setParam('type', value)}
            options={typeOptions}
            value={type}
          />
          {isPromptOnly ? null : (
            <GenerationFilterDropdown
              label={t('filterModel')}
              onChange={(value) => setParam('model', value)}
              options={allModelOptions}
              value={model}
            />
          )}
        </>
      }
      onRefresh={reload}
      isRefreshing={isLoading}
      download={
        <AdminDownloadButton
          isDisabled={generations.length === 0}
          label={t('download')}
          onClick={() => downloadCsv(generations)}
        />
      }
      dropdowns={<AdminOrgBrandUrlFilter />}
    >
      <div className="grid gap-3" data-testid="content-generations-list">
        {isLoading ? (
          GENERATION_SKELETON_KEYS.map((key) => (
            <SkeletonCard key={key} showImage />
          ))
        ) : hasError ? (
          <div role="alert">
            <CardEmptyContent
              label={t('loadError')}
              action={{ label: t('retry'), onClick: reload }}
            />
          </div>
        ) : generations.length === 0 ? (
          <CardEmptyContent label={t('empty')} />
        ) : (
          <>
            {generations.map((generation) => (
              <GenerationRow
                generation={generation}
                key={`${generation.kind}-${generation.id}`}
                onOpen={setSelected}
              />
            ))}
            <AutoPagination />
          </>
        )}
      </div>
      <GenerationDetailPanel
        generation={selected}
        onClose={() => setSelected(null)}
      />
    </AdminPageShell>
  );
}

export default function GenerationsPage() {
  return (
    <Suspense fallback={null}>
      <GenerationsPageContent />
    </Suspense>
  );
}
