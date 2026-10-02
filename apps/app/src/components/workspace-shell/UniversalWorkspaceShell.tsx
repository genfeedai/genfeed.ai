'use client';

import { AgentWorkspaceLayoutClient } from '@app/(protected)/[orgSlug]/~/agent/AgentWorkspaceLayoutClient';
import {
  AGENT_DOCK_CHROME_VISIBLE,
  useAgentDock,
} from '@contexts/ui/agent-dock-context';
import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
} from '@contexts/user/brand-context/brand-context.helpers';
import {
  type AgentApiService,
  type ConversationComposerActionInvocation,
  type ConversationComposerDispatchResult,
  ConversationComposerShellProvider,
  ConversationDockPanel,
  getConversationComposerAction,
  resolveConversationComposerDestinationHref,
  useAgentChatStore,
} from '@genfeedai/agent';
import {
  attachContentToConversationDraft,
  buildConversationComposerDraftScopeKey,
} from '@genfeedai/agent/stores/conversation-composer-draft.store';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  AgentArtifactReference,
  WorkspaceShellOverlayRequest,
} from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  InspectorToggleFallback,
  InspectorToggleHost,
} from '@ui/layout/context-inspector-toggle/ContextInspectorToggle';
import { Button } from '@ui/primitives/button';
import { Drawer, DrawerContent } from '@ui/primitives/drawer';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  AnalyticsWorkspaceSurfaceAdapterProvider,
  useActiveAnalyticsWorkspaceSurfaceAdapter,
} from '@/features/analytics/work-surface/analytics-workspace-surface-adapter-context';
import { buildLibraryRemixIntentHref } from '@/features/library-remix/library-remix-reference';
import {
  type ResearchWorkspaceSurfaceAdapterRegistration,
  ResearchWorkspaceSurfaceAdapterRegistrationContext,
} from '@/features/research/work-surface/research-workspace-surface-adapter-context';
import type { WorkflowSummary } from '@/features/workflows/services/workflow-api';
import { WorkflowPickerOverlay } from '@/features/workflows/workspace/WorkflowPickerOverlay';
import { resolveWorkflowSurfaceRoute } from '@/features/workflows/workspace/workflow-surface-routing';
import {
  appendSearchParamsToHref,
  isFocusedOnboardingPath,
  normalizeProtectedPathname,
} from '@/lib/navigation/operator-shell';
import {
  canLaunchComposerCanvas,
  canvasLaunchDispatchedResult,
  canvasLaunchUnavailableResult,
  resolveNamedComposerOverlay,
  resolveTrustedComposerAction,
} from '@/lib/workspace-shell/workspace-composer-action.util';
import { resolveWorkspaceOverlayLaunch } from '@/lib/workspace-shell/workspace-overlay-launcher';
import {
  removeWorkspaceShellOverlayParams,
  restoreWorkspaceShellLocation,
  type WorkspaceShellLocation,
  type WorkspaceShellState,
} from '@/lib/workspace-shell/workspace-shell-location';
import {
  getWorkspaceShellOverlayRegistration,
  resolveWorkspaceShellRoute,
} from '@/lib/workspace-shell/workspace-shell-registry';
import {
  captureWorkspaceShellError,
  captureWorkspaceShellOverlayAbandonment,
  captureWorkspaceShellRestorationFailure,
  captureWorkspaceShellScopeCorrection,
  captureWorkspaceShellTransition,
} from '@/lib/workspace-shell/workspace-shell-telemetry';
import {
  resolveOverlayTelemetryUpdate,
  resolveWorkspaceShellTransition,
  shouldRestorePrimaryFocus,
} from '@/lib/workspace-shell/workspace-shell-transition.util';
import { resolveWorkspaceSurfaceLaunch } from '@/lib/workspace-shell/workspace-surface-launcher';
import AgentDock from './AgentDock';
import { isMajorPromptBarHost } from './is-major-prompt-bar-host';
import { useAgentDockThreads } from './use-agent-dock-threads';
import { useIsCompactViewport } from './use-compact-viewport';
import { useConversationScopeControls } from './use-conversation-scope-controls';
import {
  WorkspaceContextSidebarDrawerBody,
  WorkspaceContextSidebarRail,
} from './WorkspaceContextSidebar';
import WorkspaceOverlayHost from './WorkspaceOverlayHost';
import { WorkspaceShellActionsProvider } from './WorkspaceShellActionsContext';
import {
  useActiveWorkspaceSurfaceAdapter,
  useActiveWorkspaceSurfacePresentationAdapter,
  useWorkspaceSurfaceAdapter,
  WorkspaceSurfaceAdapterProvider,
} from './WorkspaceSurfaceAdapterContext';

const INSPECTOR_DEFAULT_WIDTH = 320;
const INSPECTOR_MIN_WIDTH = 256;
const INSPECTOR_MAX_WIDTH = 480;
// Zero, not a rail stub: collapsed means gone, exactly like the left navigation
// sidebar. The only toggle then lives in the topbar.
const INSPECTOR_COLLAPSED_WIDTH = 0;
// Motion parity with DesktopSidebar — same duration, same curve, both axes.
const INSPECTOR_TRANSITION_DURATION_MS = 300;
const INSPECTOR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const INSPECTOR_RAIL_TRANSITION = `width ${INSPECTOR_TRANSITION_DURATION_MS}ms ${INSPECTOR_TRANSITION_EASING}, min-width ${INSPECTOR_TRANSITION_DURATION_MS}ms ${INSPECTOR_TRANSITION_EASING}`;

type UniversalWorkspaceShellProps = {
  readonly agentApiService: AgentApiService;
  readonly children: ReactNode;
  readonly composerScopeControls?: ReactNode;
};

type UniversalWorkspaceShellContentProps = Pick<
  UniversalWorkspaceShellProps,
  'agentApiService' | 'children' | 'composerScopeControls'
>;

function clampInspectorWidth(width: number): number {
  return Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, width));
}

function requireWorkspaceShellLocation(
  location: WorkspaceShellLocation | null,
): WorkspaceShellLocation {
  if (!location) {
    throw new Error(
      'Universal workspace shell received an unregistered route.',
    );
  }

  return location;
}

function UniversalWorkspaceShellContent({
  agentApiService,
  children,
  composerScopeControls,
}: UniversalWorkspaceShellContentProps) {
  const rawPathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const { back, push, replace } = useRouter();
  const { brandId, brands, organizationId, selectedBrand } = useBrand();
  const { activeHref, brandSlug, href, orgHref, orgSlug } = useOrgUrl();
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const activeSurfaceAdapter = useActiveAnalyticsWorkspaceSurfaceAdapter();
  const threads = useAgentChatStore((state) => state.threads);
  const updateThread = useAgentChatStore((state) => state.updateThread);
  const seedComposer = useAgentChatStore((state) => state.seedComposer);
  const pageContext = useAgentChatStore((state) => state.pageContext);
  const activeWorkspaceSurfaceAdapter = useActiveWorkspaceSurfaceAdapter();
  const activeSurfacePresentationAdapter =
    useActiveWorkspaceSurfacePresentationAdapter();
  const normalizedPathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );
  const isFocusedOnboardingRoute = isFocusedOnboardingPath(normalizedPathname);
  // The right column is the context sidebar: it shows the current selection
  // and stays closed while nothing is selected.
  const contextSidebar = useContextSidebar();
  const translateContextSidebar = useTranslations('common.contextSidebar');
  const activeContextSidebar =
    !isFocusedOnboardingRoute && contextSidebar?.selection
      ? contextSidebar
      : null;
  const isInspectorOpen = activeContextSidebar?.isOpen ?? false;
  const agentDock = useAgentDock();
  const isCompactViewport = useIsCompactViewport();
  // `null` keeps the inspector sized to its own content (clamped by the CSS
  // min/max below); a number means the operator has resized it explicitly.
  const [inspectorWidth, setInspectorWidth] = useState<number | null>(null);
  const [composerPortalTarget, setComposerPortalTarget] =
    useState<HTMLElement | null>(null);
  const [researchSurfaceAdapter, setResearchSurfaceAdapter] = useState<{
    readonly registration: ResearchWorkspaceSurfaceAdapterRegistration;
    readonly token: symbol;
  } | null>(null);
  const primaryRegionRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const previousPathnameRef = useRef<string | null>(null);
  const previousStateRef = useRef<WorkspaceShellState | null>(null);
  const pendingTransitionRef = useRef<
    | 'canvas_launch'
    | 'conversation_return'
    | 'overlay_dismiss'
    | 'overlay_open'
    | null
  >(null);
  const isOwnedOverlayEntryRef = useRef(false);
  const activeOverlayTelemetryClassRef = useRef<
    'library_picker' | 'notifications' | 'workflow_picker' | null
  >(null);
  const overlayCompletedRef = useRef(false);
  const hasOverlayReturnFocusRef = useRef(false);
  const overlayReturnFocusRef = useRef<HTMLElement | null>(null);

  const shellLocation = useMemo(
    () =>
      requireWorkspaceShellLocation(
        restoreWorkspaceShellLocation({
          pathname: rawPathname,
          searchParams: new URLSearchParams(searchParamsString),
        }),
      ),
    [rawPathname, searchParamsString],
  );

  const {
    canonicalSearchParams,
    isCanonical,
    overlay,
    restorationFailure,
    safeFallbackHref,
    state,
    surfaceKey,
    threadId,
  } = shellLocation;
  const overlayRegistration = useMemo(
    () => (overlay ? getWorkspaceShellOverlayRegistration(overlay.key) : null),
    [overlay],
  );
  const routeRegistration = useMemo(
    () => resolveWorkspaceShellRoute(normalizedPathname),
    [normalizedPathname],
  );
  const resolvedWorkspaceSurfaceAdapter =
    routeRegistration?.adapter.status === 'embedded' &&
    activeWorkspaceSurfaceAdapter?.registration.key ===
      routeRegistration.adapter.key &&
    activeWorkspaceSurfaceAdapter.registration.scope === routeRegistration.scope
      ? activeWorkspaceSurfaceAdapter
      : null;
  const resolvedSurfacePresentationAdapter =
    activeSurfacePresentationAdapter?.surfaceKey === surfaceKey
      ? activeSurfacePresentationAdapter
      : null;
  const effectiveSurfaceAdapter =
    activeSurfaceAdapter?.surfaceKey === surfaceKey
      ? activeSurfaceAdapter
      : null;
  const canonicalSearchParamsString = canonicalSearchParams.toString();
  // The conversation is a surface, not a shell state. `/agent/*` renders it as
  // its own canvas; every other surface reaches it through the inspector.
  const isAgentRoute =
    normalizedPathname === APP_ROUTES.AGENT.ROOT ||
    normalizedPathname.startsWith(`${APP_ROUTES.AGENT.ROOT}/`);
  const isUnthreadedConversation =
    normalizedPathname === APP_ROUTES.AGENT.ROOT ||
    normalizedPathname === APP_ROUTES.AGENT.NEW;
  const routeScope = rawPathname.split('/').filter(Boolean)[0] ?? '';
  const retainedThreadIdRef = useRef<string | null>(threadId);
  const previousRouteScopeRef = useRef(routeScope);
  const isSameRouteScope = previousRouteScopeRef.current === routeScope;
  const effectiveThreadId =
    threadId ??
    (!isAgentRoute && isSameRouteScope
      ? (retainedThreadIdRef.current ?? activeThreadId)
      : null);
  const currentHref = appendSearchParamsToHref(
    rawPathname,
    new URLSearchParams(searchParamsString),
  );
  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === effectiveThreadId) ?? null,
    [effectiveThreadId, threads],
  );
  const registeredSurfaceAdapter = useWorkspaceSurfaceAdapter();
  const productSurfaceAdapter =
    registeredSurfaceAdapter?.surfaceKey === surfaceKey
      ? registeredSurfaceAdapter
      : null;
  // Brand binding priority for inspector conversations on product routes:
  // 1) product surface adapter (studio/review scoped brand)
  // 2) workspace surface adapter
  // 3) analytics surface adapter's route-derived brand (e.g. /analytics/
  //    brands/:id and its /platforms/:platform child) — an explicit route
  //    scope, so it rebinds the thread the same way (1) and (2) do
  // 4) topbar-selected brand — so Publishing/Overview threads get a brand without
  //    an adapter. Without this, chat runs brandless and the model asks "which
  //    brand?" even though the brand switcher already has a selection.
  const surfaceBrandId = productSurfaceAdapter?.scope.brandId;
  const rawAnalyticsRouteBrandId = effectiveSurfaceAdapter?.brandId ?? null;
  // Unlike (1) and (2), which come from already-authorized product state, the
  // analytics adapter's brand is parsed straight from the URL — a stale link,
  // a deleted brand, or another org's id must never bind or sync. Falling
  // through (rather than blocking the chain) lets the topbar brand still
  // apply when the route names one we can't authorize.
  const analyticsRouteBrandId =
    rawAnalyticsRouteBrandId &&
    brands.some(
      (brand) =>
        getBrandEntityId(brand) === rawAnalyticsRouteBrandId &&
        getBrandOrganizationId(brand) === organizationId,
    )
      ? rawAnalyticsRouteBrandId
      : null;
  const topbarBrandId = brandId || null;
  const bindingBrandId =
    surfaceBrandId ??
    resolvedWorkspaceSurfaceAdapter?.brandId ??
    analyticsRouteBrandId ??
    topbarBrandId;
  const isSurfaceScopeAligned = Boolean(
    !activeThread ||
      !bindingBrandId ||
      !activeThread.brandId ||
      activeThread.brandId === bindingBrandId,
  );
  // Sync when an explicit surface brand disagrees with the thread, or when the
  // thread is unbound and the shell has a brand to attach (topbar / adapter).
  const targetSyncBrandId =
    surfaceBrandId ??
    resolvedWorkspaceSurfaceAdapter?.brandId ??
    analyticsRouteBrandId ??
    (!activeThread?.brandId ? topbarBrandId : null);
  const surfaceScopeKey =
    activeThread &&
    targetSyncBrandId &&
    activeThread.brandId !== targetSyncBrandId
      ? `${activeThread.id}:${activeThread.contextVersion}:${targetSyncBrandId}`
      : null;
  const surfaceReferences = isSurfaceScopeAligned
    ? productSurfaceAdapter?.references
    : undefined;
  const activeThreadContextVersion = activeThread?.contextVersion;
  const activeThreadIdForScope = activeThread?.id;
  const workflowSurfaceRoute = useMemo(
    () =>
      resolveWorkflowSurfaceRoute(
        rawPathname,
        new URLSearchParams(searchParamsString),
      ),
    [rawPathname, searchParamsString],
  );
  // The composer follows the conversation surface. `/agent/*` owns the canvas,
  // so its composer stays there. Every product route keeps its canvas clear and
  // hosts the composer with the conversation in the inspector. Registered
  // overlays temporarily take portal ownership from either base region.
  const isCanvasComposerVisible = state !== 'overlay' && isAgentRoute;
  const draftScopeKey = buildConversationComposerDraftScopeKey(
    orgSlug,
    effectiveThreadId,
    activeThread?.contextVersion,
  );
  // Human-readable breadcrumb leaf resolved from the route registry
  // (param-interpolated), never the raw `route:/…` pattern from `routeKey`.
  const inspectorBreadcrumbLabel =
    routeRegistration?.breadcrumb.leafLabel ?? 'Workspace';
  const shellContextLabel =
    resolvedSurfacePresentationAdapter?.contextLabel ??
    (state === 'overlay'
      ? 'Overlay · conversation connected'
      : isAgentRoute
        ? 'Conversation'
        : `Canvas · ${inspectorBreadcrumbLabel}`);
  const activeResearchSurfaceAdapter =
    researchSurfaceAdapter?.registration.surfaceKey === surfaceKey
      ? researchSurfaceAdapter.registration
      : null;

  const registerSurfaceAdapter = useCallback(
    (registration: ResearchWorkspaceSurfaceAdapterRegistration) => {
      if (registration.surfaceKey !== surfaceKey) {
        return () => undefined;
      }

      const token = Symbol(registration.surfaceKey);
      setResearchSurfaceAdapter({ registration, token });

      return () => {
        setResearchSurfaceAdapter((current) =>
          current?.token === token ? null : current,
        );
      };
    },
    [surfaceKey],
  );
  const conversationScope = useConversationScopeControls({
    activeThread,
    apiService: agentApiService,
    currentDraftScopeKey: draftScopeKey,
    pathname: rawPathname,
    routeBrandId: analyticsRouteBrandId,
    searchParams: new URLSearchParams(searchParamsString),
  });
  const effectiveShellContextLabel =
    productSurfaceAdapter?.contextLabel ??
    effectiveSurfaceAdapter?.contextLabel ??
    shellContextLabel;
  const composerContextLabel = productSurfaceAdapter
    ? effectiveShellContextLabel
    : `${conversationScope.contextLabel} · ${effectiveShellContextLabel}`;

  useEffect(() => {
    if (
      !activeThreadIdForScope ||
      activeThreadContextVersion === undefined ||
      !targetSyncBrandId ||
      !surfaceScopeKey
    ) {
      return;
    }

    const abortController = new AbortController();
    agentApiService
      .updateThreadContext(
        activeThreadIdForScope,
        {
          brandId: targetSyncBrandId,
          expectedContextVersion: activeThreadContextVersion,
        },
        abortController.signal,
      )
      .then((thread) => {
        if (abortController.signal.aborted) {
          return;
        }
        updateThread(activeThreadIdForScope, {
          brandId: thread.brandId,
          contextVersion: thread.contextVersion,
        });
        captureWorkspaceShellScopeCorrection('success');
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          captureWorkspaceShellScopeCorrection('failure');
          captureWorkspaceShellError('scope', 'scope_sync_failed');
        }
      });

    return () => abortController.abort();
  }, [
    activeThreadContextVersion,
    activeThreadIdForScope,
    agentApiService,
    surfaceScopeKey,
    targetSyncBrandId,
    updateThread,
  ]);

  useLayoutEffect(() => {
    if (!isUnthreadedConversation) {
      return;
    }

    const { resetActiveConversationState, setActiveThread } =
      useAgentChatStore.getState();
    setActiveThread(null);
    resetActiveConversationState();
  }, [isUnthreadedConversation]);

  useEffect(() => {
    if (isCanonical) {
      return;
    }

    const canonicalHref = appendSearchParamsToHref(
      rawPathname,
      new URLSearchParams(canonicalSearchParamsString),
    );
    if (restorationFailure) {
      captureWorkspaceShellRestorationFailure(restorationFailure);
      captureWorkspaceShellError('restoration', 'restoration_failed');
    }
    replace(
      restorationFailure === 'invalid_thread'
        ? safeFallbackHref
        : canonicalHref,
    );
  }, [
    canonicalSearchParamsString,
    isCanonical,
    rawPathname,
    replace,
    restorationFailure,
    safeFallbackHref,
  ]);

  useEffect(() => {
    const hasScopeChanged = previousRouteScopeRef.current !== routeScope;
    if (hasScopeChanged) {
      retainedThreadIdRef.current = null;
      const { resetActiveConversationState, setActiveThread } =
        useAgentChatStore.getState();
      setActiveThread(null);
      resetActiveConversationState();
    }
    previousRouteScopeRef.current = routeScope;

    if (threadId) {
      retainedThreadIdRef.current = threadId;
      return;
    }
    if (isUnthreadedConversation) {
      retainedThreadIdRef.current = null;
    }
  }, [isUnthreadedConversation, routeScope, threadId]);

  // Thread identity is never written to the URL. `/agent/:id` owns it in the
  // path; every other surface follows the agent store, so the conversation
  // survives navigation without leaking `?thread=` onto SaaS routes.

  useEffect(() => {
    const previousState = previousStateRef.current;
    const previousPathname = previousPathnameRef.current;
    const transition = resolveWorkspaceShellTransition({
      normalizedPathname,
      pendingTransition: pendingTransitionRef.current,
      previousPathname,
      previousState,
      state,
    });

    captureWorkspaceShellTransition({
      fromState: previousState ?? state,
      toState: state,
      transition,
    });
    previousPathnameRef.current = normalizedPathname;
    previousStateRef.current = state;
    pendingTransitionRef.current = null;

    const overlayTelemetry = resolveOverlayTelemetryUpdate({
      currentTelemetryClass: activeOverlayTelemetryClassRef.current,
      isOverlayCompleted: overlayCompletedRef.current,
      overlayTelemetryClass: overlayRegistration?.telemetryClass ?? null,
      previousState,
      state,
    });
    if (overlayTelemetry.abandonedTelemetryClass) {
      captureWorkspaceShellOverlayAbandonment(
        overlayTelemetry.abandonedTelemetryClass,
      );
    }
    activeOverlayTelemetryClassRef.current =
      overlayTelemetry.nextTelemetryClass;
    overlayCompletedRef.current = overlayTelemetry.nextCompleted;

    if (state === 'overlay') {
      return;
    }

    isOwnedOverlayEntryRef.current = false;
    if (
      shouldRestorePrimaryFocus({
        hasOverlayReturnFocus: hasOverlayReturnFocusRef.current,
        previousState,
        state,
      })
    ) {
      primaryRegionRef.current?.focus({ preventScroll: true });
    }
    hasOverlayReturnFocusRef.current = false;
  }, [normalizedPathname, overlayRegistration, state]);

  // Brand-scoped full agent surface — keeps the selected brand in the URL so
  // the expanded conversation does not lose topbar/brand context.
  const fullConversationHref = useMemo(() => {
    const destinationThreadId = effectiveThreadId ?? activeThreadId;
    return activeHref(
      destinationThreadId
        ? `${APP_ROUTES.AGENT.ROOT}/${destinationThreadId}`
        : APP_ROUTES.AGENT.NEW,
    );
  }, [activeHref, activeThreadId, effectiveThreadId]);

  const handleOpenFullConversation = useCallback(() => {
    pendingTransitionRef.current = 'conversation_return';
    // The full page is the conversation; the dock closes as it hands off
    // (arriving on `/agent` by any other way closes it once the route mounts).
    agentDock?.close();
    push(fullConversationHref);
  }, [agentDock, fullConversationHref, push]);

  // The dock is the conversation on product routes. `/agent/*` is the
  // conversation itself, so arriving there closes the dock; it stays closed
  // on the way back until the operator reopens it.
  const isAgentDockHost =
    Boolean(agentDock) && !isAgentRoute && !isFocusedOnboardingRoute;
  const dockThreads = useAgentDockThreads(agentApiService, isAgentDockHost);
  const hasMajorPromptBar = isMajorPromptBarHost(normalizedPathname);
  const setIsAgentDockAvailable = agentDock?.setIsAvailable;
  const closeAgentDock = agentDock?.close;
  const openAgentDock = agentDock?.open;
  const isAgentDockOpen = agentDock?.isOpen ?? false;
  const registerAgentDockAttachHandler = agentDock?.registerAttachHandler;
  const [hasOpenedAgentDock, setHasOpenedAgentDock] = useState(false);

  useEffect(() => {
    if (!setIsAgentDockAvailable) {
      return;
    }

    setIsAgentDockAvailable(isAgentDockHost);
    return () => setIsAgentDockAvailable(false);
  }, [isAgentDockHost, setIsAgentDockAvailable]);

  useEffect(() => {
    if (isAgentRoute && isAgentDockOpen) {
      closeAgentDock?.();
    }
  }, [closeAgentDock, isAgentDockOpen, isAgentRoute]);

  // Mount the conversation on first open, or when a registered overlay needs
  // its composer before the dock was ever opened.
  useEffect(() => {
    if (isAgentDockHost && (isAgentDockOpen || state === 'overlay')) {
      setHasOpenedAgentDock(true);
    }
  }, [isAgentDockHost, isAgentDockOpen, state]);

  useEffect(() => {
    if (!isAgentDockHost || !registerAgentDockAttachHandler) {
      return;
    }

    // Pages stamp the record's own brand; the composer leaves out one that
    // does not match the conversation instead of relabelling it.
    return registerAgentDockAttachHandler((reference) => {
      attachContentToConversationDraft(draftScopeKey, reference);
    });
  }, [draftScopeKey, isAgentDockHost, registerAgentDockAttachHandler]);

  const launchWorkspaceOverlay = useCallback(
    (overlayRequest: WorkspaceShellOverlayRequest): boolean => {
      const launch = resolveWorkspaceOverlayLaunch({
        currentHref,
        invocation: 'user',
        overlay: overlayRequest,
      });
      if (launch.history === 'none') {
        return false;
      }

      pendingTransitionRef.current = 'overlay_open';
      overlayReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      hasOverlayReturnFocusRef.current = Boolean(overlayReturnFocusRef.current);
      if (launch.history === 'replace') {
        replace(launch.href);
        return true;
      }

      isOwnedOverlayEntryRef.current = true;
      push(launch.href);
      return true;
    },
    [currentHref, push, replace],
  );

  const handleOpenWorkflowPicker = useCallback(
    (): boolean =>
      launchWorkspaceOverlay({
        key: 'workflow-picker',
        parameters: {},
      }),
    [launchWorkspaceOverlay],
  );

  const handleComposerAction = useCallback(
    (
      invocation: ConversationComposerActionInvocation,
    ): ConversationComposerDispatchResult => {
      const resolvedAction = resolveTrustedComposerAction({
        invocation,
        isConsequentiallyBlocked: conversationScope.isConsequentiallyBlocked,
        trustedAction:
          getConversationComposerAction(invocation.action.name) ?? undefined,
      });
      if (!resolvedAction.ok) {
        return resolvedAction.result;
      }

      const trustedAction = resolvedAction.action;
      if (
        trustedAction.requiredScope === 'brand' &&
        !brandSlug?.trim() &&
        !selectedBrand?.slug?.trim()
      ) {
        return {
          message:
            'Choose a brand before opening this action. Your draft is unchanged.',
          status: 'unauthorized',
        };
      }

      const overlayResult = resolveNamedComposerOverlay({
        actionName: trustedAction.name,
        openLibraryPicker: () =>
          launchWorkspaceOverlay({
            key: 'library-picker',
            parameters: {},
          }),
        openWorkflowPicker: handleOpenWorkflowPicker,
      });
      if (overlayResult) {
        return overlayResult;
      }

      const destination = resolveConversationComposerDestinationHref({
        activeHref,
        orgHref,
        route: trustedAction.route,
        routeBrandSlug: brandSlug,
        selectedBrandSlug: selectedBrand?.slug,
      });
      const launch = resolveWorkspaceSurfaceLaunch({
        currentHref,
        destinationHref: destination,
        threadId: effectiveThreadId ?? activeThreadId,
      });
      if (!canLaunchComposerCanvas(launch)) {
        return canvasLaunchUnavailableResult();
      }

      pendingTransitionRef.current = 'canvas_launch';
      push(launch.href);
      return canvasLaunchDispatchedResult(trustedAction);
    },
    [
      activeHref,
      activeThreadId,
      brandSlug,
      conversationScope.isConsequentiallyBlocked,
      currentHref,
      effectiveThreadId,
      handleOpenWorkflowPicker,
      launchWorkspaceOverlay,
      orgHref,
      push,
      selectedBrand?.slug,
    ],
  );

  const handleSelectLibraryReference = useCallback(
    (reference: AgentArtifactReference) => {
      if (
        (reference.kind !== 'asset' && reference.kind !== 'ingredient') ||
        reference.organizationId !== organizationId ||
        reference.brandId !== brandId
      ) {
        return;
      }

      const destinationHref = buildLibraryRemixIntentHref(
        href(APP_ROUTES.STUDIO.GENERATE),
        reference,
      );
      const launch = resolveWorkspaceSurfaceLaunch({
        currentHref,
        destinationHref,
        threadId: effectiveThreadId ?? activeThreadId,
      });
      if (launch.history !== 'push' || launch.mode !== 'canvas') {
        return;
      }

      pendingTransitionRef.current = 'canvas_launch';
      overlayCompletedRef.current = true;
      replace(launch.href);
    },
    [
      activeThreadId,
      brandId,
      currentHref,
      effectiveThreadId,
      href,
      organizationId,
      replace,
    ],
  );

  const handleDismissOverlay = useCallback(() => {
    pendingTransitionRef.current = 'overlay_dismiss';
    if (isOwnedOverlayEntryRef.current) {
      back();
      return;
    }

    replace(
      removeWorkspaceShellOverlayParams(
        rawPathname,
        new URLSearchParams(searchParamsString),
      ),
    );
  }, [back, rawPathname, replace, searchParamsString]);

  const openWorkflowCanvas = useCallback(
    (workflow?: WorkflowSummary) => {
      const destinationHref = href(
        workflow
          ? `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflow.id}`
          : APP_ROUTES.AUTOMATION.WORKFLOWS,
      );
      const launch = resolveWorkspaceSurfaceLaunch({
        currentHref,
        destinationHref,
        threadId: effectiveThreadId ?? activeThreadId,
      });
      if (launch.history !== 'push' || launch.mode !== 'canvas') {
        return;
      }

      pendingTransitionRef.current = 'canvas_launch';
      overlayCompletedRef.current = true;
      push(launch.href);
    },
    [activeThreadId, currentHref, effectiveThreadId, href, push],
  );

  const handleAttachWorkflow = useCallback(
    (workflow: WorkflowSummary) => {
      seedComposer(
        `Use the deterministic workflow “${workflow.label}” (workflow ID: ${workflow.id}) for this request: `,
        effectiveThreadId ?? activeThreadId,
      );
      overlayCompletedRef.current = true;
      handleDismissOverlay();
    },
    [activeThreadId, effectiveThreadId, handleDismissOverlay, seedComposer],
  );

  const resolveInspectorWidth = useCallback(
    (): number => inspectorWidth ?? INSPECTOR_DEFAULT_WIDTH,
    [inspectorWidth],
  );

  // The rail's width is state-derived, never content-derived: the topbar and the
  // main content reserve space for it down to the pixel, and `max-content` sizing
  // resolves to a fractional width that can never be matched exactly by a
  // reserved offset. A concrete number here is what keeps the topbar's right edge
  // flush against the rail's left edge with no seam.
  const expandedInspectorWidth = inspectorWidth ?? INSPECTOR_DEFAULT_WIDTH;
  const inspectorRailWidth = isInspectorOpen
    ? expandedInspectorWidth
    : INSPECTOR_COLLAPSED_WIDTH;

  // The rail is fixed-positioned, so it no longer occupies a grid track. Publishing
  // its width on the AppLayout root instead — the topbar and main content offset
  // themselves by it, exactly as they do for the left sidebar. Consumers apply the
  // offset only at `xl:`, which is also the only breakpoint where the rail renders.
  // Layout effect, not effect: publishing before first paint keeps the reserved
  // space correct on mount so the offset transition never plays on page load.
  useLayoutEffect(() => {
    const layoutRoot = inspectorRef.current?.closest<HTMLElement>(
      '[data-workspace-shell="true"]',
    );

    if (!layoutRoot) {
      return;
    }

    layoutRoot.style.setProperty(
      '--workspace-inspector-width',
      `${inspectorRailWidth}px`,
    );
    // Open, the inspector attaches to the rounded block. The block's right
    // border is the divider; this flag squares that block's right corners.
    layoutRoot.dataset.inspectorOpen = String(isInspectorOpen);

    return () => {
      layoutRoot.style.removeProperty('--workspace-inspector-width');
      delete layoutRoot.dataset.inspectorOpen;
    };
  }, [inspectorRailWidth, isInspectorOpen]);

  const handleInspectorResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = resolveInspectorWidth();

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        setInspectorWidth(
          clampInspectorWidth(startWidth + startX - moveEvent.clientX),
        );
      };
      const handleMouseUp = (): void => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [resolveInspectorWidth],
  );

  const handleInspectorResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 32 : 16;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setInspectorWidth(clampInspectorWidth(resolveInspectorWidth() + step));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setInspectorWidth(clampInspectorWidth(resolveInspectorWidth() - step));
      }
    },
    [resolveInspectorWidth],
  );

  return (
    <ConversationComposerShellProvider
      artifactReferences={
        surfaceReferences ?? resolvedWorkspaceSurfaceAdapter?.artifactReferences
      }
      brandId={
        isSurfaceScopeAligned ? (bindingBrandId ?? undefined) : undefined
      }
      contextLabel={composerContextLabel}
      dispatchAction={handleComposerAction}
      draftScopeKey={draftScopeKey}
      isConsequentiallyBlocked={conversationScope.isConsequentiallyBlocked}
      isComposerVisible
      // A message sent from an overlay opens the dock so the reply shows.
      onSendMessage={isAgentDockHost ? openAgentDock : undefined}
      placement={
        state === 'overlay' ? 'overlay' : isAgentRoute ? 'surface' : 'dock'
      }
      portalTarget={composerPortalTarget}
      references={activeResearchSurfaceAdapter?.references}
      scopeControls={
        <>
          {conversationScope.scopeControls}
          {composerScopeControls}
          {effectiveSurfaceAdapter
            ? effectiveSurfaceAdapter.composerContext
            : null}
        </>
      }
      shellState={state}
    >
      <div
        className={cn(
          'relative overflow-hidden bg-background',
          isFocusedOnboardingRoute
            ? 'min-h-[calc(100dvh-var(--desktop-titlebar-height))]'
            : // Desktop: fill the page column under the topbar. Mobile keeps
              // viewport sizing under the fixed topbar.
              'min-h-[calc(100dvh-var(--desktop-titlebar-height)-3rem)] md:flex md:min-h-0 md:flex-1 md:flex-col',
        )}
        data-shell-state={state}
        data-workspace-surface={surfaceKey}
        data-testid="universal-workspace-shell"
      >
        <div aria-live="polite" className="sr-only" role="status">
          Workspace mode: {state}. Active surface: {surfaceKey}.
          {state === 'overlay' && overlayRegistration
            ? ` ${overlayRegistration.presentation.openAnnouncement}`
            : null}
        </div>

        <div
          className={cn(
            'min-h-0',
            isFocusedOnboardingRoute
              ? 'h-[calc(100dvh-var(--desktop-titlebar-height))]'
              : 'h-[calc(100dvh-var(--desktop-titlebar-height)-3rem)] md:h-auto md:flex-1',
          )}
          data-testid="workspace-shell-regions"
        >
          {/* The route owns the canvas. Only the conversation route overlays
              its composer here; product routes keep their composer with the
              conversation inside the inspector. */}
          <div className="relative flex h-full min-h-0 min-w-0 flex-col">
            {/* One region, always. The route owns what it renders here —
                `/agent/*` hosts the conversation in its route layout
                (AgentConversationRouteHost) so thread switches never remount
                it, every other route renders its own SaaS surface. The shell
                no longer swaps
                between a hard-wired conversation and the route's children. */}
            <section
              aria-label="Primary workspace canvas"
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col bg-background focus:outline-none',
                isAgentRoute || workflowSurfaceRoute.isGraphCanvas
                  ? 'overflow-hidden'
                  : 'overflow-auto',
              )}
              data-testid="workspace-canvas-layout"
              ref={primaryRegionRef}
              tabIndex={-1}
            >
              <ResearchWorkspaceSurfaceAdapterRegistrationContext.Provider
                value={registerSurfaceAdapter}
              >
                <WorkspaceShellActionsProvider
                  openOverlay={launchWorkspaceOverlay}
                >
                  <InspectorToggleHost>
                    <InspectorToggleFallback />
                    {children}
                  </InspectorToggleHost>
                </WorkspaceShellActionsProvider>
              </ResearchWorkspaceSurfaceAdapterRegistrationContext.Provider>
            </section>

            {/* Conversation composer floats over the canvas (Codex-style):
                same max-w-3xl track as the agent transcript column so the
                prompt bar is not full-bleed. Outer centers; inner owns width.
                Empty sessions leave the slot empty (`empty:hidden`). Product
                routes never render this slot. */}
            {isCanvasComposerVisible ? (
              // overflow-visible so reconnect/error status above the glass bar
              // is not hard-clipped by the absolute bottom dock while the
              // canvas section itself stays overflow-hidden for the page.
              <div
                className="group/composer-dock pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center overflow-visible px-3 pb-6 sm:px-4 md:pb-8"
                data-testid="workspace-composer-dock"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent opacity-0 group-has-[:not(:empty)]/composer-dock:opacity-100"
                  data-composer-dock-fade=""
                />
                <div
                  className="relative z-10 w-full min-w-0 max-w-3xl overflow-visible empty:hidden"
                  data-testid="workspace-composer-slot"
                  ref={setComposerPortalTarget}
                />
              </div>
            ) : null}

            {isAgentDockHost && agentDock ? (
              <AgentDock
                chrome={AGENT_DOCK_CHROME_VISIBLE ? 'split' : 'bubble'}
                composerSlotRef={
                  state === 'overlay' ? undefined : setComposerPortalTarget
                }
                dock={agentDock}
                hasMajorPromptBar={hasMajorPromptBar}
                isCompact={isCompactViewport}
                activeThreadId={dockThreads.activeThreadId}
                isThreadListLoading={dockThreads.isThreadListLoading}
                onNewThread={dockThreads.startThread}
                onOpenFullPage={handleOpenFullConversation}
                onSelectThread={(threadId) => {
                  void dockThreads.selectThread(threadId);
                }}
                onSelectSuggestedAction={(prompt) => {
                  seedComposer(prompt, effectiveThreadId ?? activeThreadId);
                  openAgentDock?.();
                }}
                // Organization and brand are switched from the shell chrome;
                // the dock only surfaces scope notices and page context.
                scopeControls={
                  <>
                    {conversationScope.scopeStatus}
                    {composerScopeControls}
                    {effectiveSurfaceAdapter?.composerContext}
                  </>
                }
                suggestedActions={pageContext?.suggestedActions}
                threadTitle={activeThread?.title}
                threads={dockThreads.threads}
              >
                {hasOpenedAgentDock ? (
                  <ConversationDockPanel apiService={agentApiService} />
                ) : null}
              </AgentDock>
            ) : null}
          </div>

          {/* Attached to the rounded block: same top, bottom, and right inset.
              Collapsed it goes to zero — border included, or a 1px line
              survives at width 0. The shell reserves its width through
              --workspace-inspector-width. */}
          {isFocusedOnboardingRoute ? null : (
            <aside
              // Nothing selected: the empty, zero-width column is not a
              // landmark.
              aria-hidden={activeContextSidebar ? undefined : true}
              aria-label={translateContextSidebar('label')}
              className={cn(
                'fixed z-30 hidden min-h-0 flex-col overflow-hidden rounded-r-lg bg-background xl:flex',
                // The block's right border is the shared divider. The inspector
                // finishes the top, right, and bottom edges and the outer radius.
                isInspectorOpen && 'border-y border-r border-border',
              )}
              id="workspace-context-inspector"
              inert={!isInspectorOpen}
              ref={inspectorRef}
              style={{
                bottom: 'var(--shell-inset, 0px)',
                minWidth: inspectorRailWidth,
                right: 'var(--shell-inset, 0px)',
                top: 'calc(var(--desktop-titlebar-height) + var(--shell-topbar-offset, 0px))',
                transition: INSPECTOR_RAIL_TRANSITION,
                width: inspectorRailWidth,
              }}
            >
              {isInspectorOpen ? (
                <Button
                  aria-orientation="vertical"
                  aria-valuemax={INSPECTOR_MAX_WIDTH}
                  aria-valuemin={INSPECTOR_MIN_WIDTH}
                  aria-valuenow={expandedInspectorWidth}
                  ariaLabel={translateContextSidebar('resize')}
                  className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize"
                  onKeyDown={handleInspectorResizeKeyDown}
                  onMouseDown={handleInspectorResizeStart}
                  role="separator"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                />
              ) : null}
              {/* Keep the contents at their expanded width while the outer rail
                  clips them during open/close. Measuring the conversation at
                  every intermediate width makes its tabs, empty state, and
                  composer visibly collapse before growing back. The inner shell
                  also remains mounted through collapse so drafts and active runs
                  survive. Only presentation portals are gated while hidden. */}
              <div
                className="absolute inset-y-0 right-0 flex min-h-0 flex-col"
                data-testid="workspace-inspector-content"
                style={{
                  minWidth: expandedInspectorWidth,
                  width: expandedInspectorWidth,
                }}
              >
                {contextSidebar ? (
                  <div
                    className="flex min-h-0 flex-1 flex-col"
                    hidden={!activeContextSidebar}
                  >
                    <WorkspaceContextSidebarRail
                      contextSidebar={contextSidebar}
                    />
                  </div>
                ) : null}
              </div>
            </aside>
          )}
        </div>

        {isFocusedOnboardingRoute ? null : (
          <Drawer
            open={activeContextSidebar?.isMobileOpen ?? false}
            onOpenChange={(isOpen: boolean) => {
              // Dismissing the drawer is the mobile close: it deselects, so
              // tapping the item again reopens it.
              if (isOpen) {
                activeContextSidebar?.setIsMobileOpen(true);
              } else {
                activeContextSidebar?.close();
              }
            }}
          >
            <DrawerContent
              className="max-h-[85vh] rounded-t-[var(--radius-workspace-overlay)]"
              id="workspace-context-inspector-drawer"
            >
              {activeContextSidebar ? (
                <WorkspaceContextSidebarDrawerBody
                  contextSidebar={activeContextSidebar}
                />
              ) : null}
            </DrawerContent>
          </Drawer>
        )}

        <WorkspaceOverlayHost
          composerPortalRef={setComposerPortalTarget}
          content={
            overlay?.key === 'workflow-picker' ? (
              <WorkflowPickerOverlay
                activeBrandId={activeThread?.brandId}
                onAttachWorkflow={handleAttachWorkflow}
                onOpenLibrary={() => openWorkflowCanvas()}
                onOpenWorkflow={openWorkflowCanvas}
              />
            ) : undefined
          }
          fallbackFocusRef={primaryRegionRef}
          isOpen={state === 'overlay'}
          onDismiss={handleDismissOverlay}
          onSelectLibraryReference={handleSelectLibraryReference}
          overlay={overlay}
          registration={overlayRegistration}
          returnFocusRef={overlayReturnFocusRef}
        />
      </div>
    </ConversationComposerShellProvider>
  );
}

export default function UniversalWorkspaceShell({
  agentApiService,
  children,
  composerScopeControls,
}: UniversalWorkspaceShellProps) {
  return (
    <AgentWorkspaceLayoutClient agentApiService={agentApiService}>
      <WorkspaceSurfaceAdapterProvider>
        <AnalyticsWorkspaceSurfaceAdapterProvider>
          <UniversalWorkspaceShellContent
            agentApiService={agentApiService}
            composerScopeControls={composerScopeControls}
          >
            {children}
          </UniversalWorkspaceShellContent>
        </AnalyticsWorkspaceSurfaceAdapterProvider>
      </WorkspaceSurfaceAdapterProvider>
    </AgentWorkspaceLayoutClient>
  );
}
