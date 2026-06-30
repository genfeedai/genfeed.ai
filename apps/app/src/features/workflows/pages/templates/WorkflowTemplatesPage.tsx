'use client';

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
  type WorkflowTemplate,
} from '@/features/workflows/services/workflow-api';

const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All Templates' },
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
  selectedCategory: string;
  isLoading: boolean;
  error: string | null;
  isBootstrapping: boolean;
};

type PageAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; templates: WorkflowTemplate[] }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'SET_CATEGORY'; category: string }
  | { type: 'BOOTSTRAP_START' }
  | { type: 'BOOTSTRAP_ERROR'; error: string };

const initialState: PageState = {
  templates: [],
  selectedCategory: 'all',
  isLoading: true,
  error: null,
  isBootstrapping: false,
};

function pageReducer(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, error: null };
    case 'LOAD_SUCCESS':
      return { ...state, isLoading: false, templates: action.templates };
    case 'LOAD_ERROR':
      return { ...state, isLoading: false, error: action.error };
    case 'SET_CATEGORY':
      return { ...state, selectedCategory: action.category };
    case 'BOOTSTRAP_START':
      return { ...state, isBootstrapping: true, error: null };
    case 'BOOTSTRAP_ERROR':
      return { ...state, isBootstrapping: false, error: action.error };
    default:
      return state;
  }
}

/**
 * Template Gallery - Pre-built workflow templates
 */
function WorkflowTemplatesPageContent() {
  const { href } = useOrgUrl();
  const [state, dispatch] = useReducer(pageReducer, initialState);
  const { templates, selectedCategory, isLoading, error, isBootstrapping } =
    state;

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
      const data = await service.listTemplates();

      if (mountedRef.current) {
        dispatch({ type: 'LOAD_SUCCESS', templates: data });
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
    if (!templateId) {
      return;
    }

    let isCancelled = false;

    const bootstrapTemplate = async () => {
      dispatch({ type: 'BOOTSTRAP_START' });

      try {
        const service = await getService();
        const workflow = await service.create({
          edges: [],
          metadata: {
            createdFrom: 'templates',
            sourceTemplateId: templateId,
            sourceType: 'seeded-template',
          },
          name: 'Untitled Workflow',
          nodes: [],
          templateId,
          trigger: 'manual',
        });

        if (!isCancelled) {
          replace(hrefRef.current(`/workflows/${workflow._id}`));
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
  }, [getService, replace, templateId]);

  const filteredTemplates =
    selectedCategory === 'all'
      ? templates
      : templates.filter((t) => t.category === selectedCategory);

  if (isLoading || isBootstrapping) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-white/[0.08] bg-card px-6 py-4">
          <div className="mx-auto max-w-7xl">
            <div className="h-7 w-36 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-4 w-60 animate-pulse rounded bg-muted" />
          </div>
        </header>
        <div className="border-b border-white/[0.08] bg-card/50 px-6 py-3">
          <div className="mx-auto flex max-w-7xl gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-24 animate-pulse rounded bg-muted"
              />
            ))}
          </div>
        </div>
        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden border border-white/[0.08] bg-card"
              >
                <div className="aspect-video animate-pulse bg-muted" />
                <div className="p-4 space-y-2">
                  <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error) {
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
      {/* Header */}
      <header className="border-b border-white/[0.08] bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Templates</h1>
            <p className="text-sm text-muted-foreground">
              Start with a pre-built workflow template
            </p>
          </div>
          {/* Navigation handled by sidebar */}
        </div>
      </header>

      {/* Category Filter */}
      <div className="border-b border-white/[0.08] bg-card/50 px-6 py-3">
        <div className="mx-auto flex max-w-7xl gap-2">
          {TEMPLATE_CATEGORIES.map((category) => (
            <Button
              key={category.id}
              variant={ButtonVariant.UNSTYLED}
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

      {/* Template Grid */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="mb-2 text-xl font-semibold">No templates found</h2>
            <p className="mb-6 text-muted-foreground">
              {selectedCategory === 'all'
                ? 'No workflow templates are available yet.'
                : 'No templates match the selected category.'}
            </p>
            {selectedCategory !== 'all' && (
              <Button
                variant={ButtonVariant.OUTLINE}
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
                className="group relative overflow-hidden border border-white/[0.08] bg-card"
              >
                {/* Preview Image Placeholder */}
                <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5">
                  <div className="flex h-full items-center justify-center text-4xl opacity-50">
                    {template.icon || ''}
                  </div>
                </div>

                {/* Template Info */}
                <div className="p-4">
                  <h3 className="mb-1 font-semibold">{template.name}</h3>
                  <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {template.steps.length} steps
                    </span>
                    <Link
                      href={href(
                        `/workflows/templates?template=${template.id}`,
                      )}
                      className=" bg-primary px-4 py-2 text-sm text-primary-foreground opacity-0 transition-opacity hover:bg-primary/90 group-hover:opacity-100"
                    >
                      Use Template
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
