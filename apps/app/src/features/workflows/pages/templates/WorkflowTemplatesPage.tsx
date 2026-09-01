'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useReducer, useRef } from 'react';
import {
  createWorkflowApiService,
  type SystemWorkflowCatalogEntry,
  type WorkflowTemplate,
} from '@/features/workflows/services/workflow-api';

const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All Templates' },
  { id: 'system', label: 'System' },
  { id: 'social', label: 'Social Media' },
  { id: 'video', label: 'Video' },
  { id: 'editing', label: 'Editing' },
  { id: 'batch', label: 'Batch' },
  { id: 'integration', label: 'Integration' },
  { id: 'generation', label: 'Generation' },
  { id: 'real-estate', label: 'Real Estate' },
  { id: 'routines', label: 'Routines' },
];

type PageState = {
  templates: WorkflowTemplate[];
  systemCatalog: SystemWorkflowCatalogEntry[];
  selectedCategory: string;
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

/**
 * Template Gallery — generation templates + system catalog install (#2176).
 *
 * System catalog entries are app-owned automations the org installs on demand
 * (no clone at signup). Generation templates still bootstrap via create + templateId.
 */
function WorkflowTemplatesPageContent() {
  const { href } = useOrgUrl();
  const [state, dispatch] = useReducer(pageReducer, initialState);
  const {
    templates,
    systemCatalog,
    selectedCategory,
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

  // Stable navigation callback : avoids re-running the bootstrap effect
  // when useOrgUrl() returns a fresh href function on each render.
  const hrefRef = useRef(href);
  hrefRef.current = href;

  useEffect(() => {
    // Wait for catalog+templates load so system installables are classified
    // correctly before creating from a generation template id.
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

  const showSystemSection =
    selectedCategory === 'all' || selectedCategory === 'system';
  const showGenerationSection = selectedCategory !== 'system';

  const filteredTemplates =
    selectedCategory === 'all' || selectedCategory === 'system'
      ? templates
      : templates.filter((t) => t.category === selectedCategory);

  const isContentLoading = isLoading || isBootstrapping;

  if (error && templates.length === 0 && systemCatalog.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant={ButtonVariant.DEFAULT} onClick={loadTemplates}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <h1 className="sr-only">Templates</h1>

      <div className="border-b border-border bg-card/50 px-6 py-3">
        <div className="mx-auto flex max-w-7xl gap-2">
          {TEMPLATE_CATEGORIES.map((category) => (
            <Button
              key={category.id}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
              onClick={() =>
                dispatch({ type: 'SET_CATEGORY', category: category.id })
              }
              className={`px-4 py-2 text-sm transition-colors ${
                selectedCategory === category.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              }`}
            >
              {category.label}
            </Button>
          ))}
        </div>
      </div>

      <main
        className="mx-auto max-w-7xl space-y-10 px-6 py-8"
        data-testid="templates-content"
      >
        {!isContentLoading && error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {!isContentLoading && showSystemSection ? (
          <section aria-labelledby="system-catalog-heading">
            <div className="mb-4">
              <h2
                id="system-catalog-heading"
                className="text-lg font-semibold tracking-tight"
              >
                System workflows
              </h2>
              <p className="text-sm text-muted-foreground">
                App-owned automations. Install the ones you want — nothing is
                copied into your org until you install.
              </p>
            </div>

            {systemCatalog.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No installable system workflows are available.
              </p>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {systemCatalog.map((entry) => {
                  const isInstalling =
                    installingCanonicalId === entry.canonicalId;

                  return (
                    <div
                      key={entry.canonicalId}
                      className="group relative overflow-hidden bg-card shadow-border"
                    >
                      <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5">
                        <div className="flex h-full items-center justify-center text-4xl opacity-50">
                          {entry.icon || '⚙'}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="font-semibold">{entry.label}</h3>
                          {entry.installed ? (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary">
                              Installed
                            </span>
                          ) : null}
                        </div>
                        <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                          {entry.description}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {entry.family}
                            {entry.schedule ? ` · ${entry.schedule}` : ''}
                          </span>
                          <Button
                            variant={ButtonVariant.DEFAULT}
                            withWrapper={false}
                            disabled={isInstalling}
                            onClick={() => {
                              void handleInstallSystem(entry);
                            }}
                            className="px-4 py-2 text-sm"
                          >
                            {isInstalling
                              ? 'Installing…'
                              : entry.installed
                                ? 'Open'
                                : 'Install'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {!isContentLoading && showGenerationSection ? (
          <section aria-labelledby="generation-templates-heading">
            {selectedCategory === 'all' ? (
              <div className="mb-4">
                <h2
                  id="generation-templates-heading"
                  className="text-lg font-semibold tracking-tight"
                >
                  Templates
                </h2>
                <p className="text-sm text-muted-foreground">
                  Starting points for custom workflows.
                </p>
              </div>
            ) : null}

            {filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <h2 className="mb-2 text-xl font-semibold">
                  No templates found
                </h2>
                <p className="mb-6 text-muted-foreground">
                  {selectedCategory === 'all'
                    ? 'No workflow templates are available yet.'
                    : 'No templates match the selected category.'}
                </p>
                {selectedCategory !== 'all' && (
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    onClick={() =>
                      dispatch({ type: 'SET_CATEGORY', category: 'all' })
                    }
                  >
                    View All Templates
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="group relative overflow-hidden bg-card shadow-border"
                  >
                    <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5">
                      <div className="flex h-full items-center justify-center text-4xl opacity-50">
                        {template.icon || ''}
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="mb-1 font-semibold">{template.name}</h3>
                      <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                        {template.description}
                      </p>
                      <div className="flex justify-end">
                        <Link
                          href={href(
                            `${APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES}?template=${template.id}`,
                          )}
                          className="bg-primary px-4 py-2 text-sm text-primary-foreground opacity-0 transition-opacity hover:bg-primary/90 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
                        >
                          Use Template
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default function WorkflowTemplatesPage() {
  return (
    <Suspense fallback={null}>
      <WorkflowTemplatesPageContent />
    </Suspense>
  );
}
