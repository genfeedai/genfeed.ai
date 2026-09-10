'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  formatEnumLabel,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
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
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { describeCadence } from '@/features/workflows/components/schedule/schedule-cadence';
import {
  createWorkflowApiService,
  type SystemWorkflowCatalogEntry,
  type WorkflowTemplate,
} from '@/features/workflows/services/workflow-api';
import WorkflowCardPreview from '../library/WorkflowCardPreview';
import { workflowCollectionHeaderTabs } from '../workflow-library-tabs';
import { WorkflowTemplateDetailsDialog } from './WorkflowTemplateDetailsDialog';

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All categories',
  system: 'System',
  social: 'Social Media',
  video: 'Video',
  editing: 'Editing',
  batch: 'Batch',
  integration: 'Integration',
  generation: 'Generation',
  'real-estate': 'Real Estate',
  routines: 'Routines',
  library: 'Library',
  product: 'Product',
  'ad-automation': 'Ads',
  content: 'Content',
};

const SOURCE_FILTERS = [
  { id: 'all', label: 'All sources' },
  { id: 'installed', label: 'Installed' },
  { id: 'available', label: 'Available' },
] as const;

type CatalogSource = (typeof SOURCE_FILTERS)[number]['id'];

type CatalogItem = {
  actionLabel: string;
  category: string;
  changeSummary?: string;
  description: string;
  edges?: Edge[];
  href?: string;
  id: string;
  nodes?: Node[];
  schedule?: string;
  source: Exclude<CatalogSource, 'all'>;
  systemEntry?: SystemWorkflowCatalogEntry;
  thumbnail?: string | null;
  title: string;
};

type PageState = {
  templates: WorkflowTemplate[];
  systemCatalog: SystemWorkflowCatalogEntry[];
  selectedCategory: string;
  selectedSource: CatalogSource;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  isBootstrapping: boolean;
  installingCanonicalId: string | null;
};

type PageAction =
  | { type: 'LOAD_START' }
  | {
      type: 'LOAD_SUCCESS';
      templates: WorkflowTemplate[];
      systemCatalog: SystemWorkflowCatalogEntry[];
    }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'SET_CATEGORY'; category: string }
  | { type: 'SET_SOURCE'; source: CatalogSource }
  | { type: 'SET_SEARCH'; searchQuery: string }
  | { type: 'BOOTSTRAP_START' }
  | { type: 'BOOTSTRAP_ERROR'; error: string }
  | { type: 'INSTALL_START'; canonicalId: string }
  | {
      type: 'INSTALL_SUCCESS';
      canonicalId: string;
      installedWorkflowId: string;
    }
  | { type: 'INSTALL_ERROR'; error: string };

const initialState: PageState = {
  templates: [],
  systemCatalog: [],
  selectedCategory: 'all',
  selectedSource: 'all',
  searchQuery: '',
  isLoading: true,
  error: null,
  isBootstrapping: false,
  installingCanonicalId: null,
};

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, error: null };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        isLoading: false,
        templates: action.templates,
        systemCatalog: action.systemCatalog,
      };
    case 'LOAD_ERROR':
      return { ...state, isLoading: false, error: action.error };
    case 'SET_CATEGORY':
      return { ...state, selectedCategory: action.category };
    case 'SET_SOURCE':
      return { ...state, selectedSource: action.source };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.searchQuery };
    case 'BOOTSTRAP_START':
      return { ...state, isBootstrapping: true, error: null };
    case 'BOOTSTRAP_ERROR':
      return { ...state, isBootstrapping: false, error: action.error };
    case 'INSTALL_START':
      return {
        ...state,
        installingCanonicalId: action.canonicalId,
        error: null,
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
        error: action.error,
      };
    default:
      return state;
  }
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? formatEnumLabel(category) ?? category;
}

function cadenceLabel(cron?: string): string | null {
  const described = describeCadence(cron);
  if (!described) {
    return null;
  }
  return /[*]/.test(described) ? 'Scheduled' : described;
}

function sourceBadge(source: CatalogItem['source']): string {
  if (source === 'installed') {
    return 'Installed';
  }
  return 'Available';
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
    actionLabel: entry.installed ? 'Open' : 'Install',
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
    actionLabel: 'Use template',
    category: template.category || 'generation',
    changeSummary: template.changeSummary,
    description: template.description,
    edges: template.edges,
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
  const { href } = useOrgUrl();
  const [state, dispatch] = useReducer(pageReducer, initialState);
  const {
    templates,
    systemCatalog,
    selectedCategory,
    selectedSource,
    searchQuery,
    isLoading,
    error,
    isBootstrapping,
    installingCanonicalId,
  } = state;

  const mountedRef = useRef(true);
  const getService = useAuthedService(createWorkflowApiService);
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');
  const [detailsItem, setDetailsItem] = useState<CatalogItem | null>(null);

  const loadTemplates = useCallback(async () => {
    dispatch({ type: 'LOAD_START' });

    try {
      if (!mountedRef.current) {
        return;
      }

      const service = await getService();
      const [data, catalog] = await Promise.all([
        service.listTemplates(),
        service.listSystemCatalog(),
      ]);

      if (mountedRef.current) {
        dispatch({
          type: 'LOAD_SUCCESS',
          systemCatalog: catalog.filter((entry) => entry.installable),
          templates: data,
        });
      }
    } catch (err) {
      logger.error('Failed to load workflow templates', { error: err });

      if (mountedRef.current) {
        dispatch({
          type: 'LOAD_ERROR',
          error: 'Failed to load templates. Please try again.',
        });
      }
    }
  }, [getService]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    loadTemplates();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [loadTemplates]);

  const hrefRef = useRef(href);
  hrefRef.current = href;

  useEffect(() => {
    if (!templateId || isLoading) {
      return;
    }

    let isCancelled = false;

    const bootstrapTemplate = async () => {
      dispatch({ type: 'BOOTSTRAP_START' });

      try {
        const service = await getService();
        const isSystemCatalogId = systemCatalog.some(
          (entry) => entry.canonicalId === templateId,
        );

        if (isSystemCatalogId) {
          const workflow = await service.installSystemCatalog(templateId);
          if (!isCancelled) {
            replace(
              hrefRef.current(
                `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`,
              ),
            );
          }
          return;
        }

        const workflow = await service.create({
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

        if (!isCancelled) {
          replace(
            hrefRef.current(
              `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`,
            ),
          );
        }
      } catch (err) {
        logger.error('Failed to bootstrap workflow template', { error: err });

        if (!isCancelled) {
          dispatch({
            type: 'BOOTSTRAP_ERROR',
            error:
              err instanceof Error
                ? err.message
                : 'Failed to install workflow template',
          });
        }
      }
    };

    void bootstrapTemplate();

    return () => {
      isCancelled = true;
    };
  }, [getService, isLoading, replace, systemCatalog, templateId]);

  const handleInstallSystem = useCallback(
    async (entry: SystemWorkflowCatalogEntry) => {
      if (entry.installed && entry.installedWorkflowId) {
        replace(
          href(
            `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${entry.installedWorkflowId}`,
          ),
        );
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
        replace(href(`${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`));
      } catch (err) {
        logger.error('Failed to install system workflow', {
          canonicalId: entry.canonicalId,
          error: err,
        });
        dispatch({
          type: 'INSTALL_ERROR',
          error:
            err instanceof Error
              ? err.message
              : 'Failed to install system workflow',
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

  const categoryOptions = useMemo(() => {
    const present = new Set(catalogItems.map((item) => item.category));
    return [
      { id: 'all', label: CATEGORY_LABELS.all },
      ...[...present].sort().map((id) => ({ id, label: categoryLabel(id) })),
    ];
  }, [catalogItems]);

  const isContentLoading = isLoading || isBootstrapping;

  const catalogChrome = {
    headerTabs: workflowCollectionHeaderTabs(href),
    label: 'Workflows',
    leading: (
      <FormSearchbar
        className="w-64"
        onSearch={(value) =>
          dispatch({ type: 'SET_SEARCH', searchQuery: value })
        }
        placeholder="Search templates..."
        size={ComponentSize.SM}
        value={searchQuery}
      />
    ),
    right: (
      <div className="flex items-center gap-2">
        <Select
          value={selectedSource}
          onValueChange={(value) =>
            dispatch({ type: 'SET_SOURCE', source: value as CatalogSource })
          }
        >
          <SelectTrigger aria-label="Source" className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_FILTERS.map((filter) => (
              <SelectItem key={filter.id} value={filter.id}>
                {filter.label}
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
          <SelectTrigger aria-label="Category" className="h-8 w-40">
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
      </div>
    ),
    titleVisibility: 'sr-only' as const,
  };

  if (error && templates.length === 0 && systemCatalog.length === 0) {
    return (
      <Container {...catalogChrome}>
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4">
          <p className="text-destructive">{error}</p>
          <Button variant={ButtonVariant.DEFAULT} onClick={loadTemplates}>
            Retry
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <Container {...catalogChrome}>
      {!isContentLoading && error ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div data-testid="templates-content">
        {isContentLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map(
              (skeletonId) => (
                <div
                  key={skeletonId}
                  className="h-64 animate-pulse rounded-card bg-card shadow-border"
                />
              ),
            )}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-foreground/50">
              No workflows match these filters.
            </p>
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={() => {
                dispatch({ type: 'SET_CATEGORY', category: 'all' });
                dispatch({ type: 'SET_SOURCE', source: 'all' });
                dispatch({ type: 'SET_SEARCH', searchQuery: '' });
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => {
              const isInstalling =
                item.systemEntry?.canonicalId === installingCanonicalId;
              const schedule = cadenceLabel(item.schedule);

              return (
                <Card
                  key={item.id}
                  className="h-full"
                  label={item.title}
                  description={item.description}
                  onDescriptionClick={() => setDetailsItem(item)}
                  headerAction={
                    <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-foreground/60">
                      {sourceBadge(item.source)}
                    </span>
                  }
                  bodyClassName="justify-between gap-4"
                >
                  <WorkflowCardPreview
                    name={item.title}
                    thumbnail={item.thumbnail}
                    nodes={item.nodes}
                    edges={item.edges}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {schedule ?? categoryLabel(item.category)}
                    </span>
                    {item.systemEntry && !item.href ? (
                      <Button
                        variant={ButtonVariant.DEFAULT}
                        size={ButtonSize.SM}
                        disabled={isInstalling}
                        onClick={() => {
                          const entry = item.systemEntry;
                          if (!entry) {
                            return;
                          }
                          void handleInstallSystem(entry);
                        }}
                      >
                        {isInstalling ? 'Installing…' : item.actionLabel}
                      </Button>
                    ) : item.href ? (
                      <Button
                        asChild
                        variant={ButtonVariant.DEFAULT}
                        size={ButtonSize.SM}
                        withWrapper={false}
                      >
                        <Link href={item.href}>{item.actionLabel}</Link>
                      </Button>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <WorkflowTemplateDetailsDialog
        actionLabel={detailsItem?.actionLabel ?? ''}
        categoryLabel={detailsItem ? categoryLabel(detailsItem.category) : ''}
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
                void handleInstallSystem(entry);
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
        scheduleLabel={detailsItem ? cadenceLabel(detailsItem.schedule) : null}
        sourceLabel={detailsItem ? sourceBadge(detailsItem.source) : ''}
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
