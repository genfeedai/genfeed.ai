'use client';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import { ModelsService } from '@services/ai/models.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import SubbarOverflowMenu from '@ui/layout/subbar-overflow-menu/SubbarOverflowMenu';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { EmptyState } from '@ui/primitives/empty-state';
import { Download, Image as ImageIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import AdminOrgBrandUrlFilter, {
  useAdminOrgBrandParams,
} from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import type {
  GenerationStatusOption,
  GenerationView,
} from '@/features/admin/props/generations.props';
import GenerationDetailPanel from './generation-detail-panel';
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
const EMPTY_GENERATIONS: GenerationView[] = [];
const EMPTY_MODEL_OPTIONS: GenerationStatusOption[] = [];

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

  const notificationsService = NotificationsService.getInstance();
  const [selected, setSelected] = useState<GenerationView | null>(null);

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

  const clearFilters = useCallback(() => {
    const next = new URLSearchParams(searchParamsString);
    for (const name of ['status', 'type', 'model', 'page']) next.delete(name);
    const query = next.toString();
    replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, replace, searchParamsString]);

  // Cached per filter set and page: coming back to Generations paints the rows
  // it already has while it refreshes, and paging keeps the current rows on
  // screen.
  const filterKey = {
    brand,
    isPromptOnly,
    model,
    organization,
    search,
    status,
    type,
  };
  const generationsQuery = usePagedAuthedQuery({
    keepPreviousDataWithin: ['admin', 'generations', filterKey],
    queryFn: async (services, signal) => {
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
          const fetched = await services.prompts.findAdminWithoutGeneration(
            query,
            signal,
          );
          return { ...fetched, items: fetched.items.map(toPromptView) };
        }
        if (status) query.status = status;
        if (type) query.category = type;
        if (model) query.model = model;
        const fetched = await services.ingredients.findAdminGenerationReviews(
          query,
          signal,
        );
        return { ...fetched, items: fetched.items.map(toGenerationView) };
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load generations', error);
        }
        throw error;
      }
    },
    queryKey: ['admin', 'generations', filterKey, { page: currentPage }],
    service: (token: string) => ({
      ingredients: IngredientsService.getInstance('ingredients', token),
      prompts: PromptsService.getInstance(token),
    }),
  });
  const {
    errorUpdatedAt,
    isError: hasError,
    isFetching: isRefreshing,
    isLoading,
    refetch,
  } = generationsQuery;
  const generations = hasError
    ? EMPTY_GENERATIONS
    : (generationsQuery.data?.items ?? EMPTY_GENERATIONS);

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (hasError) {
      notificationsService.error(t('loadError'));
    }
  }, [errorUpdatedAt, hasError, notificationsService, t]);

  const modelsQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      try {
        const models = await service.findAll(
          { limit: MODEL_OPTIONS_LIMIT, sort: 'label: 1' },
          signal,
        );
        return models
          .filter((item) => item.key)
          .map((item) => ({
            label: item.label || item.key,
            value: item.key,
          }));
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load model filter options', error);
        }
        throw error;
      }
    },
    queryKey: ['admin', 'generations', 'model-options'],
    service: (token: string) => ModelsService.getInstance(token),
  });
  const modelOptions: GenerationStatusOption[] =
    modelsQuery.data ?? EMPTY_MODEL_OPTIONS;

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

  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  return (
    <AdminPageShell
      title={t('title')}
      icon={ImageIcon}
      search={
        <SearchField
          ariaLabel={t('search')}
          onSearch={(value) => setParam('q', value.trim())}
          placeholder={t('search')}
          value={search}
        >
          <FilterMenu
            facets={[
              ...(isPromptOnly
                ? []
                : ([
                    {
                      defaultValue: '',
                      key: 'status',
                      label: t('filterStatus'),
                      onChange: (value) => setParam('status', value),
                      options: statusOptions,
                      selection: 'single',
                      value: status,
                    },
                  ] satisfies FilterMenuFacet[])),
              {
                defaultValue: '',
                key: 'type',
                label: t('filterType'),
                onChange: (value) => setParam('type', value),
                options: typeOptions,
                selection: 'single',
                value: type,
              },
              ...(isPromptOnly
                ? []
                : ([
                    {
                      defaultValue: '',
                      key: 'model',
                      label: t('filterModel'),
                      onChange: (value) => setParam('model', value),
                      options: allModelOptions,
                      searchPlaceholder: t('search'),
                      selection: 'single',
                      value: model,
                    },
                  ] satisfies FilterMenuFacet[])),
            ]}
            isAttached
            onClear={clearFilters}
          />
        </SearchField>
      }
      onRefresh={reload}
      isRefreshing={isRefreshing}
      overflow={
        <SubbarOverflowMenu
          actions={[
            {
              icon: <Download className="size-4" />,
              id: 'download',
              isDisabled: generations.length === 0,
              label: t('download'),
              onSelect: () => downloadCsv(generations),
            },
          ]}
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
            <EmptyState
              title={t('loadError')}
              action={{ label: t('retry'), onClick: reload }}
            />
          </div>
        ) : generations.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <>
            {generations.map((generation) => (
              <GenerationRow
                generation={generation}
                key={`${generation.kind}-${generation.id}`}
                onOpen={setSelected}
              />
            ))}
            <AutoPagination
              totals={generationsQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
            />
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
