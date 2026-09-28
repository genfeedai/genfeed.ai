'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  formatEnumLabel,
  ViewType,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import CollectionView from '@ui/collection/CollectionView';
import Container from '@ui/layout/container/Container';
import HorizontalCarousel from '@ui/layout/horizontal-carousel/HorizontalCarousel';
import ListRow from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { Edge, Node } from '@xyflow/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  createWorkflowApiService,
  type SystemWorkflowCatalogEntry,
  type WorkflowApiService,
  type WorkflowTemplate,
} from '@/features/workflows/services/workflow-api';
import WorkflowCardPreview from '../library/WorkflowCardPreview';
import { workflowCollectionHeaderTabs } from '../workflow-library-tabs';
import { WorkflowTemplateDetailsDialog } from './WorkflowTemplateDetailsDialog';

/**
 * Category ids with a catalog label, mapped to their `categories.*` key.
 * Covers every `category` the API's workflow templates and system catalog
 * ship (`apps/server/api/src/collections/workflows/templates/`), plus the
 * page's own `all` and `system` fallbacks.
 */
const CATEGORY_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  'ad-automation': 'adAutomation',
  ads: 'ads',
  agents: 'agents',
  all: 'all',
  analytics: 'analytics',
  automation: 'automation',
  batch: 'batch',
  campaigns: 'campaigns',
  content: 'content',
  editing: 'editing',
  entertainment: 'entertainment',
  generation: 'generation',
  integration: 'integration',
  launch: 'launch',
  library: 'library',
  product: 'product',
  'real-estate': 'realEstate',
  routines: 'routines',
  social: 'social',
  system: 'system',
  trends: 'trends',
  video: 'video',
};

/**
 * Schedule presets (`WORKFLOW_SCHEDULE_PRESETS`) mapped to their
 * `cadences.*` key. Any other cron reads as the generic "Scheduled".
 */
const CADENCE_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  '0 9 * * 1-5': 'weekdaysMorning',
  '0 9 * * *': 'dailyMorning',
  '0 12 * * *': 'dailyNoon',
  '0 18 * * *': 'dailyEvening',
  '0 9 * * 1': 'mondaysMorning',
  '0 9,18 * * *': 'twiceDaily',
  '0 9 1 * *': 'monthlyFirst',
};

const CATALOG_SOURCES = ['all', 'installed', 'available'] as const;

type CatalogSource = (typeof CATALOG_SOURCES)[number];

/** The two catalog requests. Each settles on its own. */
const DATA_SOURCES = ['templates', 'systemCatalog'] as const;

type DataSource = (typeof DATA_SOURCES)[number];

type DataSourceStatus = 'loading' | 'ready' | 'error';

type ActionErrorKey = 'bootstrap' | 'install';

/** Copy is resolved at render, so a stored error follows the active locale. */
type ActionError = {
  detail?: string;
  key: ActionErrorKey;
};

type Translate = (key: string) => string;

/**
 * One `?template=` creation attempt. A creation runs once per template, auth
 * scope and explicit "Try again"; data reloads never start another one.
 */
type BootstrapAttempt = {
  request: number;
  /** The auth-scoped service getter; a new identity means a new scope. */
  scope: unknown;
  templateId: string;
};

/** View preference key — one list/grid choice per collection surface. */
const TEMPLATES_COLLECTION_SURFACE = 'automation.templates';

/** Featured is a short carousel, not a second copy of the catalog. */
const FEATURED_TEMPLATE_LIMIT = 6;

/** Type tiles only help when there is more than one type to pick between. */
const MIN_TYPE_TILES = 2;

type CatalogItem = {
  category: string;
  changeSummary?: string;
  description: string;
  edges?: Edge[];
  featuredRank?: number;
  href?: string;
  id: string;
  nodes?: Node[];
  schedule?: string;
  source: Exclude<CatalogSource, 'all'>;
  systemEntry?: SystemWorkflowCatalogEntry;
  thumbnail?: string | null;
  title: string;
};

type TypeTile = {
  count: number;
  id: string;
  label: string;
};

type PageState = {
  templates: WorkflowTemplate[];
  systemCatalog: SystemWorkflowCatalogEntry[];
  sourceStatus: Record<DataSource, DataSourceStatus>;
  /** True once every request has settled at least once. */
  hasSettled: boolean;
  selectedCategory: string;
  selectedSource: CatalogSource;
  searchQuery: string;
  actionError: ActionError | null;
  isBootstrapping: boolean;
  installingCanonicalId: string | null;
};

type PageAction =
  | { type: 'LOAD_START'; sources: readonly DataSource[] }
  | { type: 'TEMPLATES_LOADED'; templates: WorkflowTemplate[] }
  | { type: 'CATALOG_LOADED'; systemCatalog: SystemWorkflowCatalogEntry[] }
  | { type: 'LOAD_FAILED'; source: DataSource }
  | { type: 'SET_CATEGORY'; category: string }
  | { type: 'SET_SOURCE'; source: CatalogSource }
  | { type: 'SET_SEARCH'; searchQuery: string }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'BOOTSTRAP_START' }
  | { type: 'BOOTSTRAP_CANCEL' }
  | { type: 'BOOTSTRAP_ERROR'; error: ActionError }
  | { type: 'INSTALL_START'; canonicalId: string }
  | {
      type: 'INSTALL_SUCCESS';
      canonicalId: string;
      installedWorkflowId: string;
    }
  | { type: 'INSTALL_ERROR'; error: ActionError };

const initialState: PageState = {
  templates: [],
  systemCatalog: [],
  sourceStatus: { systemCatalog: 'loading', templates: 'loading' },
  hasSettled: false,
  selectedCategory: 'all',
  selectedSource: 'all',
  searchQuery: '',
  actionError: null,
  isBootstrapping: false,
  installingCanonicalId: null,
};

function settleSource(
  state: PageState,
  source: DataSource,
  status: Exclude<DataSourceStatus, 'loading'>,
  data: Partial<Pick<PageState, 'systemCatalog' | 'templates'>> = {},
): PageState {
  const sourceStatus = { ...state.sourceStatus, [source]: status };
  return {
    ...state,
    ...data,
    hasSettled:
      state.hasSettled ||
      DATA_SOURCES.every((key) => sourceStatus[key] !== 'loading'),
    sourceStatus,
  };
}

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'LOAD_START': {
      const sourceStatus = { ...state.sourceStatus };
      for (const source of action.sources) {
        sourceStatus[source] = 'loading';
      }
      return { ...state, sourceStatus };
    }
    case 'TEMPLATES_LOADED':
      return settleSource(state, 'templates', 'ready', {
        templates: action.templates,
      });
    case 'CATALOG_LOADED':
      return settleSource(state, 'systemCatalog', 'ready', {
        systemCatalog: action.systemCatalog,
      });
    case 'LOAD_FAILED':
      return settleSource(state, action.source, 'error');
    case 'SET_CATEGORY':
      return { ...state, selectedCategory: action.category };
    case 'SET_SOURCE':
      return { ...state, selectedSource: action.source };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.searchQuery };
    case 'CLEAR_FILTERS':
      return {
        ...state,
        searchQuery: '',
        selectedCategory: 'all',
        selectedSource: 'all',
      };
    case 'BOOTSTRAP_START':
      return { ...state, isBootstrapping: true, actionError: null };
    case 'BOOTSTRAP_CANCEL':
      return {
        ...state,
        actionError:
          state.actionError?.key === 'bootstrap' ? null : state.actionError,
        isBootstrapping: false,
      };
    case 'BOOTSTRAP_ERROR':
      return { ...state, isBootstrapping: false, actionError: action.error };
    case 'INSTALL_START':
      return {
        ...state,
        installingCanonicalId: action.canonicalId,
        actionError: null,
      };
    case 'INSTALL_SUCCESS':
      return {
        ...state,
        installingCanonicalId: null,
        systemCatalog: state.systemCatalog.map((entry) =>
          entry.canonicalId === action.canonicalId
            ? {
                ...entry,
                installed: true,
                installedWorkflowId: action.installedWorkflowId,
              }
            : entry,
        ),
      };
    case 'INSTALL_ERROR':
      return {
        ...state,
        installingCanonicalId: null,
        actionError: action.error,
      };
    default:
      return state;
  }
}

/** Fetches one catalog request and describes its result as a reducer action. */
async function fetchDataSource(
  service: WorkflowApiService,
  source: DataSource,
): Promise<PageAction> {
  if (source === 'templates') {
    return {
      templates: await service.listTemplates(),
      type: 'TEMPLATES_LOADED',
    };
  }
  const catalog = await service.listSystemCatalog();
  return {
    systemCatalog: catalog.filter((entry) => entry.installable),
    type: 'CATALOG_LOADED',
  };
}

/**
 * Localized label for a category id. Known ids resolve through the
 * `categories.*` messages; ids the catalog does not know are title-cased.
 */
export function categoryLabel(category: string, translate: Translate): string {
  const messageKey = CATEGORY_MESSAGE_KEYS[category];
  if (messageKey) {
    return translate(`categories.${messageKey}`);
  }
  return formatEnumLabel(category) ?? category;
}

/** Localized cadence for a preset cron; any other schedule is "Scheduled". */
export function cadenceLabel(
  cron: string | undefined,
  translate: Translate,
): string | null {
  const trimmed = cron?.trim();
  if (!trimmed) {
    return null;
  }
  const messageKey = CADENCE_MESSAGE_KEYS[trimmed];
  return messageKey
    ? translate(`cadences.${messageKey}`)
    : translate('scheduled');
}

function isCatalogSource(value: string): value is CatalogSource {
  return CATALOG_SOURCES.some((source) => source === value);
}

function buildCatalogItems({
  systemCatalog,
  templates,
  href,
}: {
  href: (path: string) => string;
  systemCatalog: SystemWorkflowCatalogEntry[];
  templates: WorkflowTemplate[];
}): CatalogItem[] {
  const catalogItems: CatalogItem[] = systemCatalog.map((entry) => ({
    category: entry.category || entry.family || 'system',
    changeSummary: entry.changeSummary,
    description: entry.description,
    edges: entry.edges,
    href:
      entry.installed && entry.installedWorkflowId
        ? href(
            `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${entry.installedWorkflowId}`,
          )
        : undefined,
    id: `system-${entry.canonicalId}`,
    nodes: entry.nodes,
    schedule: entry.schedule,
    source: entry.installed ? 'installed' : 'available',
    systemEntry: entry,
    title: entry.label,
  }));

  const templateItems: CatalogItem[] = templates.map((template) => ({
    category: template.category || 'generation',
    changeSummary: template.changeSummary,
    description: template.description,
    edges: template.edges,
    featuredRank: template.featuredRank,
    href: href(
      `${APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES}?template=${template.id}`,
    ),
    id: `template-${template.id}`,
    nodes: template.nodes,
    schedule: template.schedule,
    source: 'available',
    title: template.name,
  }));

  return [...catalogItems, ...templateItems];
}

/** Featured uses the curated showcase only; system workflows are never featured. */
function selectFeaturedItems(items: CatalogItem[]): CatalogItem[] {
  return items
    .filter((item) => !item.systemEntry && Number.isFinite(item.featuredRank))
    .sort((left, right) => (left.featuredRank ?? 0) - (right.featuredRank ?? 0))
    .slice(0, FEATURED_TEMPLATE_LIMIT);
}

function buildTypeTiles(
  items: CatalogItem[],
  translate: Translate,
): TypeTile[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      count,
      id,
      label: categoryLabel(id, translate),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function filterCatalogItems(
  items: CatalogItem[],
  {
    category,
    searchQuery,
    source,
  }: {
    category: string;
    searchQuery: string;
    source: CatalogSource;
  },
): CatalogItem[] {
  const query = searchQuery.trim().toLowerCase();
  return items.filter((item) => {
    if (source !== 'all' && item.source !== source) {
      return false;
    }
    if (category !== 'all' && item.category !== category) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
    );
  });
}

function WorkflowTemplatesPageContent() {
  const translate = useTranslations('pages.workflows.templates');
  const translateWorkflows = useTranslations('common.automation.workflows');
  const { href } = useOrgUrl();
  const [state, dispatch] = useReducer(pageReducer, initialState);
  const {
    templates,
    systemCatalog,
    sourceStatus,
    hasSettled,
    selectedCategory,
    selectedSource,
    searchQuery,
    actionError,
    isBootstrapping,
    installingCanonicalId,
  } = state;

  const mountedRef = useRef(true);
  const getService = useAuthedService(createWorkflowApiService);
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');
  const templateIdRef = useRef(templateId);
  templateIdRef.current = templateId;
  const catalogScopeRef = useRef<typeof getService | null>(null);
  const [detailsItem, setDetailsItem] = useState<CatalogItem | null>(null);
  const { view, setView } = useCollectionViewPreference({
    defaultView: ViewType.LIST,
    surface: TEMPLATES_COLLECTION_SURFACE,
  });

  /**
   * Per-request generation for each data source. Only the latest request
   * for a source, made in the current auth scope, may write its state.
   */
  const requestGenerationRef = useRef<Record<DataSource, number>>({
    systemCatalog: 0,
    templates: 0,
  });
  const scopeRef = useRef(getService);
  scopeRef.current = getService;

  /**
   * Loads the given requests side by side. Each one settles independently,
   * so a failed request only takes out the sections that depend on it.
   */
  const loadSources = useCallback(
    async (sources: readonly DataSource[], signal?: AbortSignal) => {
      const scope = getService;
      const generations = sources.map((source) => {
        requestGenerationRef.current[source] += 1;
        return requestGenerationRef.current[source];
      });
      const isCurrent = (index: number) =>
        signal?.aborted !== true &&
        mountedRef.current &&
        scopeRef.current === scope &&
        requestGenerationRef.current[sources[index]] === generations[index];

      dispatch({ type: 'LOAD_START', sources });

      let service: WorkflowApiService;
      try {
        service = await getService();
      } catch (err) {
        logger.error('Failed to load workflow templates', { error: err });
        sources.forEach((source, index) => {
          if (isCurrent(index)) {
            dispatch({ type: 'LOAD_FAILED', source });
          }
        });
        return;
      }

      const results = await Promise.allSettled(
        sources.map((source) => fetchDataSource(service, source)),
      );

      results.forEach((result, index) => {
        if (!isCurrent(index)) {
          return;
        }
        const source = sources[index];
        if (result.status === 'fulfilled') {
          if (source === 'systemCatalog') {
            catalogScopeRef.current = scope;
          }
          dispatch(result.value);
          return;
        }
        logger.error('Failed to load workflow templates', {
          error: result.reason,
          source,
        });
        dispatch({ type: 'LOAD_FAILED', source });
      });
    },
    [getService],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const generations = requestGenerationRef.current;

    void loadSources(DATA_SOURCES, controller.signal);

    return () => {
      mountedRef.current = false;
      controller.abort();
      // An auth scope change or unmount retires every outstanding request,
      // Retry clicks included.
      for (const source of DATA_SOURCES) {
        generations[source] += 1;
      }
    };
  }, [loadSources]);

  const hrefRef = useRef(href);
  hrefRef.current = href;

  const isAnySourceLoading = DATA_SOURCES.some(
    (source) => sourceStatus[source] === 'loading',
  );
  // The catalog decides between installing an official workflow and
  // creating from a starter template, so creation waits for it.
  const isSystemCatalogReady = sourceStatus.systemCatalog === 'ready';

  const [bootstrapRequest, setBootstrapRequest] = useState(0);
  const bootstrapAttemptRef = useRef<BootstrapAttempt | null>(null);

  useEffect(() => {
    if (!templateId) {
      if (bootstrapAttemptRef.current) {
        bootstrapAttemptRef.current = null;
        dispatch({ type: 'BOOTSTRAP_CANCEL' });
      }
      return;
    }

    const previous = bootstrapAttemptRef.current;
    if (
      previous &&
      (previous.templateId !== templateId || previous.scope !== getService)
    ) {
      bootstrapAttemptRef.current = null;
      dispatch({ type: 'BOOTSTRAP_CANCEL' });
    }

    if (!isSystemCatalogReady || catalogScopeRef.current !== getService) {
      return;
    }
    if (
      previous &&
      previous.templateId === templateId &&
      previous.scope === getService &&
      previous.request === bootstrapRequest
    ) {
      // Already attempted: a data reload must not create the workflow again.
      return;
    }

    const attempt: BootstrapAttempt = {
      request: bootstrapRequest,
      scope: getService,
      templateId,
    };
    bootstrapAttemptRef.current = attempt;
    const isCurrentAttempt = () =>
      mountedRef.current &&
      bootstrapAttemptRef.current === attempt &&
      templateIdRef.current === attempt.templateId &&
      scopeRef.current === attempt.scope;

    const bootstrapTemplate = async () => {
      dispatch({ type: 'BOOTSTRAP_START' });

      try {
        const service = await getService();
        if (!isCurrentAttempt()) {
          return;
        }
        const isSystemCatalogId = systemCatalog.some(
          (entry) => entry.canonicalId === templateId,
        );

        const workflow = isSystemCatalogId
          ? await service.installSystemCatalog(templateId)
          : await service.create({
              edges: [],
              metadata: {
                createdFrom: 'templates',
                sourceTemplateId: templateId,
                sourceType: 'seeded-template',
              },
              label: 'Untitled Workflow',
              nodes: [],
              templateId,
            });

        if (isCurrentAttempt()) {
          replace(
            hrefRef.current(
              `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`,
            ),
          );
        }
      } catch (err) {
        logger.error('Failed to bootstrap workflow template', { error: err });

        if (isCurrentAttempt()) {
          dispatch({
            type: 'BOOTSTRAP_ERROR',
            error: {
              detail: err instanceof Error ? err.message : undefined,
              key: 'bootstrap',
            },
          });
        }
      }
    };

    void bootstrapTemplate();
  }, [
    bootstrapRequest,
    getService,
    isSystemCatalogReady,
    replace,
    systemCatalog,
    templateId,
  ]);

  /**
   * Installs an app-owned catalog workflow. "Use template" installs and opens
   * it; the overflow "Install" adds it to the library and keeps the viewer
   * browsing, so the entry flips to Installed in place.
   */
  const installSystemEntry = useCallback(
    async (
      entry: SystemWorkflowCatalogEntry,
      isOpeningAfterInstall: boolean,
    ) => {
      if (entry.installed && entry.installedWorkflowId) {
        if (isOpeningAfterInstall) {
          replace(
            href(
              `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${entry.installedWorkflowId}`,
            ),
          );
        }
        return;
      }

      dispatch({ type: 'INSTALL_START', canonicalId: entry.canonicalId });

      try {
        const service = await getService();
        const workflow = await service.installSystemCatalog(entry.canonicalId);
        dispatch({
          type: 'INSTALL_SUCCESS',
          canonicalId: entry.canonicalId,
          installedWorkflowId: workflow.id,
        });
        if (isOpeningAfterInstall) {
          replace(href(`${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`));
        }
      } catch (err) {
        logger.error('Failed to install system workflow', {
          canonicalId: entry.canonicalId,
          error: err,
        });
        dispatch({
          type: 'INSTALL_ERROR',
          error: {
            detail: err instanceof Error ? err.message : undefined,
            key: 'install',
          },
        });
      }
    },
    [getService, href, replace],
  );

  const catalogItems = useMemo(
    () =>
      buildCatalogItems({
        href,
        systemCatalog,
        templates,
      }),
    [href, systemCatalog, templates],
  );

  const visibleItems = useMemo(
    () =>
      filterCatalogItems(catalogItems, {
        category: selectedCategory,
        searchQuery,
        source: selectedSource,
      }),
    [catalogItems, searchQuery, selectedCategory, selectedSource],
  );

  const featuredItems = useMemo(
    () => selectFeaturedItems(catalogItems),
    [catalogItems],
  );

  const typeTiles = useMemo(
    () => buildTypeTiles(catalogItems, translate),
    [catalogItems, translate],
  );

  const failedSources = DATA_SOURCES.filter(
    (source) => sourceStatus[source] === 'error',
  );
  const isTemplatesLoading = sourceStatus.templates === 'loading';
  const isFeaturedLoading = isBootstrapping || isTemplatesLoading;
  // A retry keeps whatever already loaded on screen; only an empty All
  // falls back to skeletons while a request is in flight.
  const isAllLoading =
    isBootstrapping ||
    !hasSettled ||
    (catalogItems.length === 0 && isAnySourceLoading);
  const hasLoadFailure = failedSources.length > 0;

  function sourceLabel(source: CatalogSource): string {
    return translate(`sources.${source}`);
  }

  function factsLine(item: CatalogItem): string {
    return [
      sourceLabel(item.source),
      categoryLabel(item.category, translate),
      cadenceLabel(item.schedule, translate),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function loadErrorMessage(sources: readonly DataSource[]): string {
    if (sources.length > 1) {
      return translate('errors.load');
    }
    return sources[0] === 'templates'
      ? translate('errors.loadTemplates')
      : translate('errors.loadCatalog');
  }

  function renderLoadError(sources: readonly DataSource[]) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{loadErrorMessage(sources)}</span>
        <Button
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          onClick={() => void loadSources(sources)}
        >
          {translate('retry')}
        </Button>
      </div>
    );
  }

  function renderPrimaryAction(item: CatalogItem) {
    if (item.href) {
      return (
        <Button
          asChild
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          withWrapper={false}
        >
          <Link href={item.href}>{translate('actions.useTemplate')}</Link>
        </Button>
      );
    }

    const entry = item.systemEntry;
    if (!entry) {
      return null;
    }

    const isInstalling = entry.canonicalId === installingCanonicalId;
    return (
      <Button
        variant={ButtonVariant.DEFAULT}
        size={ButtonSize.SM}
        disabled={isInstalling}
        onClick={() => void installSystemEntry(entry, true)}
      >
        {isInstalling
          ? translate('actions.installing')
          : translate('actions.useTemplate')}
      </Button>
    );
  }

  function overflowActions(item: CatalogItem): CollectionOverflowAction[] {
    const actions: CollectionOverflowAction[] = [
      {
        id: 'details',
        label: translate('actions.viewDetails'),
        onSelect: () => setDetailsItem(item),
      },
    ];

    const entry = item.systemEntry;
    if (entry && !entry.installed) {
      actions.push({
        id: 'install',
        isDisabled: entry.canonicalId === installingCanonicalId,
        label: translate('actions.install'),
        onSelect: () => void installSystemEntry(entry, false),
      });
    }

    return actions;
  }

  function renderItemActions(item: CatalogItem) {
    return (
      <CollectionItemActions
        overflow={overflowActions(item)}
        primary={renderPrimaryAction(item)}
      />
    );
  }

  function renderTemplateCard(item: CatalogItem) {
    return (
      <Card
        className="h-full"
        label={item.title}
        description={item.description}
        bodyClassName="h-full justify-between gap-4"
        data-testid="workflow-template-card"
      >
        <WorkflowCardPreview
          name={item.title}
          thumbnail={item.thumbnail}
          nodes={item.nodes}
          edges={item.edges}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {factsLine(item)}
          </span>
          {renderItemActions(item)}
        </div>
      </Card>
    );
  }

  function renderTemplateRow(item: CatalogItem) {
    return (
      <ListRow
        title={item.title}
        description={item.description}
        meta={factsLine(item)}
        trailing={renderItemActions(item)}
        data-testid="workflow-template-row"
      />
    );
  }

  const filterChips = [
    ...(selectedCategory !== 'all'
      ? [
          {
            id: 'category',
            label: categoryLabel(selectedCategory, translate),
            onRemove: () => dispatch({ type: 'SET_CATEGORY', category: 'all' }),
          },
        ]
      : []),
    ...(selectedSource !== 'all'
      ? [
          {
            id: 'source',
            label: sourceLabel(selectedSource),
            onRemove: () => dispatch({ type: 'SET_SOURCE', source: 'all' }),
          },
        ]
      : []),
  ];

  const categoryOptions = [
    { id: 'all', label: categoryLabel('all', translate) },
    ...typeTiles.map((tile) => ({ id: tile.id, label: tile.label })),
  ];

  const catalogChrome = {
    headerTabs: workflowCollectionHeaderTabs(href),
    label: translateWorkflows('library.title'),
    titleVisibility: 'sr-only' as const,
  };

  const isCatalogEmpty =
    hasSettled &&
    !isAnySourceLoading &&
    !isBootstrapping &&
    !hasLoadFailure &&
    catalogItems.length === 0;

  return (
    <Container {...catalogChrome}>
      {!isBootstrapping && actionError ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive" role="alert">
            {actionError.detail ?? translate(`errors.${actionError.key}`)}
          </p>
          {actionError.key === 'bootstrap' && templateId ? (
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() => setBootstrapRequest((request) => request + 1)}
            >
              {translate('actions.tryAgain')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-8" data-testid="templates-content">
        <CollectionSection
          title={translate('sections.featured')}
          itemCount={isFeaturedLoading ? 0 : featuredItems.length}
          error={
            // Held while a template bootstraps; the page is about to leave.
            !isBootstrapping && sourceStatus.templates === 'error'
              ? renderLoadError(['templates'])
              : undefined
          }
          data-testid="templates-featured-section"
        >
          <HorizontalCarousel gap="md">
            {featuredItems.map((item) => (
              <div key={item.id} className="w-[min(26rem,85%)] shrink-0">
                {renderTemplateCard(item)}
              </div>
            ))}
          </HorizontalCarousel>
        </CollectionSection>

        <CollectionSection
          title={translate('sections.browseByType')}
          itemCount={
            isBootstrapping ||
            isAnySourceLoading ||
            typeTiles.length < MIN_TYPE_TILES
              ? 0
              : typeTiles.length
          }
          data-testid="templates-browse-section"
        >
          <CollectionGrid density="tile" maxColumns={4}>
            {typeTiles.map((tile) => {
              const isSelected = tile.id === selectedCategory;
              return (
                <Card
                  key={tile.id}
                  className={cn(isSelected && 'shadow-border-strong')}
                  bodyClassName="gap-1"
                  isPressed={isSelected}
                  label={tile.label}
                  onClick={() =>
                    dispatch({ type: 'SET_CATEGORY', category: tile.id })
                  }
                  data-testid="workflow-template-type-tile"
                >
                  <span className="text-xs text-muted-foreground">
                    {translate('templateCount', { count: tile.count })}
                  </span>
                </Card>
              );
            })}
          </CollectionGrid>
        </CollectionSection>

        <CollectionSection
          title={translate('sections.all')}
          itemCount={catalogItems.length}
          isLoading={isAllLoading}
          error={
            !isAllLoading && hasLoadFailure && catalogItems.length === 0
              ? renderLoadError(failedSources)
              : undefined
          }
          data-testid="templates-all-section"
        >
          <CollectionToolbar
            search={
              <FormSearchbar
                className="w-64"
                onSearch={(value) =>
                  dispatch({ type: 'SET_SEARCH', searchQuery: value })
                }
                placeholder={translate('searchPlaceholder')}
                size={ComponentSize.SM}
                value={searchQuery}
              />
            }
            filters={
              <>
                <Select
                  value={selectedSource}
                  onValueChange={(value) => {
                    if (isCatalogSource(value)) {
                      dispatch({ type: 'SET_SOURCE', source: value });
                    }
                  }}
                >
                  <SelectTrigger
                    aria-label={translate('source')}
                    className="h-8 w-36"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATALOG_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {sourceLabel(source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={selectedCategory}
                  onValueChange={(value) =>
                    dispatch({ type: 'SET_CATEGORY', category: value })
                  }
                >
                  <SelectTrigger
                    aria-label={translate('category')}
                    className="h-8 w-40"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            view={view}
            onViewChange={setView}
            chips={filterChips}
            onClearChips={() => dispatch({ type: 'CLEAR_FILTERS' })}
          />
          {hasLoadFailure && !isAllLoading ? (
            <div role="alert">
              <Card bodyClassName="px-4 py-3 text-sm text-muted-foreground">
                {renderLoadError(failedSources)}
              </Card>
            </div>
          ) : null}
          <CollectionView
            items={visibleItems}
            view={view}
            getItemKey={(item) => item.id}
            renderListItem={renderTemplateRow}
            renderGridItem={renderTemplateCard}
            maxColumns={3}
            isLoading={isAllLoading}
            emptyState={
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm text-foreground/50">
                  {translate('noMatches')}
                </p>
                <Button
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => dispatch({ type: 'CLEAR_FILTERS' })}
                >
                  {translate('clearFilters')}
                </Button>
              </div>
            }
            data-testid="templates-all-collection"
          />
        </CollectionSection>

        {isCatalogEmpty ? (
          <p className="py-16 text-center text-sm text-foreground/50">
            {translate('emptyCatalog')}
          </p>
        ) : null}
      </div>
      <WorkflowTemplateDetailsDialog
        actionLabel={translate('actions.useTemplate')}
        categoryLabel={
          detailsItem ? categoryLabel(detailsItem.category, translate) : ''
        }
        changeSummary={detailsItem?.changeSummary}
        description={detailsItem?.description ?? ''}
        href={detailsItem?.href}
        isInstalling={
          detailsItem?.systemEntry?.canonicalId === installingCanonicalId
        }
        isOpen={detailsItem !== null}
        onInstall={
          detailsItem?.systemEntry && !detailsItem.href
            ? () => {
                const entry = detailsItem.systemEntry;
                if (!entry) {
                  return;
                }
                void installSystemEntry(entry, true);
              }
            : undefined
        }
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setDetailsItem(null);
          }
        }}
        preview={
          detailsItem
            ? {
                edges: detailsItem.edges,
                name: detailsItem.title,
                nodes: detailsItem.nodes,
                thumbnail: detailsItem.thumbnail,
              }
            : undefined
        }
        scheduleLabel={
          detailsItem ? cadenceLabel(detailsItem.schedule, translate) : null
        }
        sourceLabel={detailsItem ? sourceLabel(detailsItem.source) : ''}
        title={detailsItem?.title ?? ''}
      />
    </Container>
  );
}

export default function WorkflowTemplatesPage() {
  return (
    <Suspense fallback={null}>
      <WorkflowTemplatesPageContent />
    </Suspense>
  );
}
