import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { useRoutedOrganization } from '@genfeedai/contexts/user/organization-context/organization-context';
import { ViewType } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  BootstrapAttempt,
  DataSource,
} from '@/features/workflows/props/workflow-templates-page.props';
import {
  createWorkflowApiService,
  type SystemWorkflowCatalogEntry,
  type WorkflowApiService,
} from '@/features/workflows/services/workflow-api';
import { useCollectionViewPreference } from '@/hooks/utils/use-collection-view-preference/use-collection-view-preference';
import {
  reserveTemplateAttempt,
  templateAttemptKey,
  templateAttemptScope,
} from './template-bootstrap-attempt';
import {
  DATA_SOURCES,
  fetchDataSource,
  initialState,
  pageReducer,
} from './workflow-template-state';
import type { CatalogItem } from './workflow-template-types';

const TEMPLATES_COLLECTION_SURFACE = 'automation.templates';

export function useWorkflowTemplatesPage() {
  const { href, orgSlug, brandSlug } = useOrgUrl();
  const { isLoaded, userId } = useAuthIdentity();
  const {
    isRouteConfirmed,
    confirmedOrganizationId: orgId,
    confirmedOrganizationSlug,
  } = useRoutedOrganization();
  const { organizationId, brands, isBrandScopeResolved } = useBrand();
  const routeBrand = brands.find((brand) => brand.slug === brandSlug);
  const isBrandRoute = Boolean(brandSlug && brandSlug !== '~');
  const routeBrandId = isBrandRoute ? routeBrand?.id : undefined;
  const isScopeReady = Boolean(
    isLoaded &&
      isRouteConfirmed &&
      confirmedOrganizationSlug === orgSlug &&
      userId &&
      orgId &&
      organizationId === orgId &&
      (!isBrandRoute || (isBrandScopeResolved && routeBrandId)),
  );
  const scopeKey = JSON.stringify([
    userId,
    orgId,
    orgSlug,
    brandSlug,
    routeBrandId,
    isScopeReady,
  ]);
  const [state, dispatch] = useReducer(pageReducer, initialState);
  const { sourceStatus, systemCatalog } = state;

  const mountedRef = useRef(true);
  const getService = useAuthedService(createWorkflowApiService);
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');
  const templateIdRef = useRef(templateId);
  templateIdRef.current = templateId;
  const catalogScopeRef = useRef<string | null>(null);
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
    featured: 0,
    systemCatalog: 0,
    templates: 0,
  });
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;

  /**
   * Loads the given requests side by side. Each one settles independently,
   * so a failed request only takes out the sections that depend on it.
   */
  const loadSources = useCallback(
    async (sources: readonly DataSource[], signal?: AbortSignal) => {
      const scope = scopeKey;
      if (!isScopeReady) return;
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
    [getService, isScopeReady, scopeKey],
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

  // The catalog decides between installing an official workflow and
  // creating from a starter template, so creation waits for it.
  const isSystemCatalogReady = sourceStatus.systemCatalog === 'ready';

  const [bootstrapRequest, setBootstrapRequest] = useState(0);
  const bootstrapAttemptRef = useRef<BootstrapAttempt | null>(null);
  const postedAttemptRef = useRef<string | null>(null);
  const bootstrapIdentity = JSON.stringify([
    scopeKey,
    templateId,
    bootstrapRequest,
  ]);
  const bootstrapIdentityRef = useRef(bootstrapIdentity);
  if (bootstrapIdentityRef.current !== bootstrapIdentity)
    postedAttemptRef.current = null;
  bootstrapIdentityRef.current = bootstrapIdentity;
  const isSystemCatalogId = systemCatalog.some(
    (entry) => entry.canonicalId === templateId,
  );

  useEffect(() => {
    if (!templateId) {
      if (bootstrapAttemptRef.current) {
        bootstrapAttemptRef.current = null;
        dispatch({ type: 'BOOTSTRAP_CANCEL' });
      }
      return;
    }

    if (postedAttemptRef.current === bootstrapIdentity) return;
    const previous = bootstrapAttemptRef.current;
    if (
      previous &&
      (previous.templateId !== templateId || previous.scope !== scopeKey)
    ) {
      bootstrapAttemptRef.current = null;
      dispatch({ type: 'BOOTSTRAP_CANCEL' });
    }

    if (
      !isScopeReady ||
      !isSystemCatalogReady ||
      catalogScopeRef.current !== scopeKey
    ) {
      return;
    }
    if (
      previous &&
      previous.templateId === templateId &&
      previous.scope === scopeKey &&
      previous.request === bootstrapRequest
    ) {
      // Already attempted: a data reload must not create the workflow again.
      return;
    }

    const attempt: BootstrapAttempt = {
      request: bootstrapRequest,
      scope: scopeKey,
      templateId,
    };
    const persistentScope = templateAttemptScope(
      userId!,
      orgId!,
      JSON.stringify([orgSlug, brandSlug, routeBrandId]),
      templateId,
    );
    const nonce = reserveTemplateAttempt(persistentScope);
    bootstrapAttemptRef.current = attempt;
    const controller = new AbortController();
    const isCurrentAttempt = () =>
      !controller.signal.aborted &&
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
        const idempotencyKey = isSystemCatalogId
          ? undefined
          : await templateAttemptKey(persistentScope, nonce);
        if (!isCurrentAttempt()) return;
        postedAttemptRef.current = bootstrapIdentity;
        const workflow = isSystemCatalogId
          ? await service.installSystemCatalog(templateId)
          : await service.create({
              ...(isBrandRoute ? { brandId: routeBrandId } : {}),
              idempotencyKey,
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
    return () => {
      controller.abort();
      if (bootstrapAttemptRef.current === attempt) {
        bootstrapAttemptRef.current = null;
        dispatch({ type: 'BOOTSTRAP_CANCEL' });
      }
    };
  }, [
    bootstrapRequest,
    getService,
    isSystemCatalogReady,
    isScopeReady,
    scopeKey,
    userId,
    orgId,
    orgSlug,
    brandSlug,
    isBrandRoute,
    routeBrandId,
    replace,
    isSystemCatalogId,
    bootstrapIdentity,
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

  /**
   * "Use" on a Featured workflow (#5511): copies it into this organization as
   * a new draft and opens the copy. The pinned source is never modified.
   */
  const copyFeaturedWorkflow = useCallback(
    async (workflowId: string) => {
      dispatch({ type: 'COPY_FEATURED_START', workflowId });

      try {
        const service = await getService();
        const workflow = await service.copyFeatured(workflowId);
        replace(href(`${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`));
      } catch (err) {
        logger.error('Failed to use featured workflow', {
          error: err,
          workflowId,
        });
        dispatch({
          type: 'COPY_FEATURED_ERROR',
          error: {
            detail: err instanceof Error ? err.message : undefined,
            key: 'copyFeatured',
          },
        });
      }
    },
    [getService, href, replace],
  );

  function retryBootstrap() {
    if (!userId || !orgId || !templateId) return;
    reserveTemplateAttempt(
      templateAttemptScope(
        userId,
        orgId,
        JSON.stringify([orgSlug, brandSlug, routeBrandId]),
        templateId,
      ),
      true,
    );
    setBootstrapRequest((request) => request + 1);
  }

  return {
    state,
    dispatch,
    href,
    detailsItem,
    setDetailsItem,
    view,
    setView,
    loadSources,
    installSystemEntry,
    copyFeaturedWorkflow,
    templateId,
    retryBootstrap,
  };
}
