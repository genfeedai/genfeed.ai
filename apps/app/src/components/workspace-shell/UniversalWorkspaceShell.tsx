'use client';

import { AgentWorkspaceLayoutClient } from '@app/(protected)/[orgSlug]/~/agent/AgentWorkspaceLayoutClient';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type AgentApiService,
  type ConversationComposerActionInvocation,
  type ConversationComposerDispatchResult,
  ConversationComposerShellProvider,
  ConversationInspectorPanel,
  ConversationInspectorShellProvider,
  getConversationComposerAction,
  resolveConversationComposerDestinationHref,
  runAgentApiEffect,
  useAgentChatStore,
} from '@genfeedai/agent';
import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import type {
  AgentArtifactReference,
  WorkspaceShellOverlayRequest,
  WorkspaceShellSurfaceKey,
} from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@ui/primitives/drawer';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  OPEN_BROWSER_TAB_EVENT,
  OPEN_CONTEXT_TAB_EVENT,
  OPEN_CONVERSATION_TAB_EVENT,
  OPEN_FILES_TAB_EVENT,
} from '@/lib/workspace/agent-composer-events';
import {
  canLaunchComposerCanvas,
  canvasLaunchDispatchedResult,
  canvasLaunchUnavailableResult,
  resolveNamedComposerOverlay,
  resolveTrustedComposerAction,
} from '@/lib/workspace-shell/workspace-composer-action.util';
import { WORKSPACE_INSPECTOR_CHROME } from '@/lib/workspace-shell/workspace-inspector-chrome';
import {
  closeInspectorKind,
  openInspectorKind,
  persistInspectorTabLayout,
  readPersistedInspectorTabLayout,
  resolveAvailableInspectorKinds,
  resolveInspectorTabLayout,
  toggleInspectorKind,
  type WorkspaceInspectorAssetKind,
  type WorkspaceInspectorTabLayout,
} from '@/lib/workspace-shell/workspace-inspector-tabs.util';
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
import { useConversationScopeControls } from './use-conversation-scope-controls';
import WorkspaceInspectorContent from './WorkspaceInspectorContent';
import {
  useRegisterWorkspaceInspector,
  useWorkspaceInspector,
} from './WorkspaceInspectorContext';
import { WorkspaceInspectorPreviewProvider } from './WorkspaceInspectorPreviewContext';
import WorkspaceOverlayHost from './WorkspaceOverlayHost';
import { WorkspaceShellActionsProvider } from './WorkspaceShellActionsContext';
import {
  useActiveWorkspaceSurfaceAdapter,
  useActiveWorkspaceSurfacePresentationAdapter,
  useWorkspaceSurfaceAdapter,
  WorkspaceSurfaceAdapterProvider,
} from './WorkspaceSurfaceAdapterContext';
import {
  isInspectorComposerOwner,
  type WorkspaceInspectorTab,
} from './workspace-inspector-kind.util';

const INSPECTOR_DEFAULT_WIDTH = 320;
const INSPECTOR_MIN_WIDTH = 256;
const INSPECTOR_MAX_WIDTH = 480;
// Zero, not a rail stub: collapsed means gone, exactly like the left navigation
// sidebar. The only toggle then lives in the topbar (WorkspaceInspectorContext).
const INSPECTOR_COLLAPSED_WIDTH = 0;
// Motion parity with DesktopSidebar — same duration, same curve, both axes.
const INSPECTOR_TRANSITION_DURATION_MS = 300;
const INSPECTOR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const INSPECTOR_RAIL_TRANSITION = `width ${INSPECTOR_TRANSITION_DURATION_MS}ms ${INSPECTOR_TRANSITION_EASING}, min-width ${INSPECTOR_TRANSITION_DURATION_MS}ms ${INSPECTOR_TRANSITION_EASING}`;

// The workflow inspector belongs to the Automation module's workflow family: the
// graph canvas (`workflows/new`, `workflows/:id`) plus the list, templates and
// executions routes that share the module surface key. Both keys are checked
// because the canvas routes are registered as their own surface; the pathname
// still has to carry a `workflows` segment so sibling Automation routes (runs,
// skills, autopilot) keep the generic inspector.
const WORKFLOW_INSPECTOR_SURFACE_KEYS: ReadonlySet<WorkspaceShellSurfaceKey> =
  new Set(['automation', 'automation-workflows-editor']);

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
  const { brandId, organizationId, selectedBrand } = useBrand();
  const { activeHref, brandSlug, href, orgHref, orgSlug } = useOrgUrl();
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const activeSurfaceAdapter = useActiveAnalyticsWorkspaceSurfaceAdapter();
  const threads = useAgentChatStore((state) => state.threads);
  const updateThread = useAgentChatStore((state) => state.updateThread);
  const seedComposer = useAgentChatStore((state) => state.seedComposer);
  const activeWorkspaceSurfaceAdapter = useActiveWorkspaceSurfaceAdapter();
  const activeSurfacePresentationAdapter =
    useActiveWorkspaceSurfacePresentationAdapter();
  const normalizedPathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );
  const isFocusedOnboardingRoute = isFocusedOnboardingPath(normalizedPathname);
  // The topbar owns the inspector toggle, so open state is shared through a
  // provider that sits above AppLayout. The shell also renders standalone (unit
  // tests, non-protected layouts) where there is no toggle at all, so it defaults
  // to expanded there. Focused onboarding is conversation-only — no inspector.
  const workspaceInspector = useWorkspaceInspector();
  const isInspectorOpen =
    !isFocusedOnboardingRoute && (workspaceInspector?.isOpen ?? true);
  useRegisterWorkspaceInspector(!isFocusedOnboardingRoute);
  // Below `xl` the inspector renders as a drawer whose opener is the same
  // topbar toggle slot, so its open state also lives in the shared provider.
  // Standalone shells (unit tests, non-protected layouts) have no provider and
  // fall back to local state.
  const [localMobileInspectorOpen, setLocalMobileInspectorOpen] =
    useState(false);
  const isMobileInspectorOpen =
    workspaceInspector?.isMobileOpen ?? localMobileInspectorOpen;
  const setIsMobileInspectorOpen =
    workspaceInspector?.setIsMobileOpen ?? setLocalMobileInspectorOpen;
  // `null` keeps the inspector sized to its own content (clamped by the CSS
  // min/max below); a number means the operator has resized it explicitly.
  const [inspectorWidth, setInspectorWidth] = useState<number | null>(null);
  const [composerPortalTarget, setComposerPortalTarget] =
    useState<HTMLElement | null>(null);
  // The agent conversation hands its context panels (setup, outputs) to the
  // inspector rail instead of painting a second right-hand column inside the
  // conversation region. `hasAgentInspectorPanel` lets the rail stand down its
  // own generic context content while the agent owns it.
  const [agentInspectorPortalTarget, setAgentInspectorPortalTarget] =
    useState<HTMLElement | null>(null);
  const [hasAgentInspectorPanel, setHasAgentInspectorPanel] = useState(false);
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
    | 'library_picker'
    | 'notifications'
    | 'shell_preview'
    | 'workflow_picker'
    | null
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
  const canonicalSearchParamsString = canonicalSearchParams.toString();
  // The conversation is a surface, not a shell state. `/agent/*` renders it as
  // its own canvas; every other surface reaches it through the inspector.
  const isAgentRoute =
    normalizedPathname === APP_ROUTES.AGENT.ROOT ||
    normalizedPathname.startsWith(`${APP_ROUTES.AGENT.ROOT}/`);
  const hasConversationInspectorSlot = !isAgentRoute;
  const [inspectorTabIntent, setInspectorTabIntent] =
    useState<WorkspaceInspectorTabLayout | null>(null);
  const [hasLoadedInspectorTabs, setHasLoadedInspectorTabs] = useState(false);
  const availableInspectorKinds = useMemo(
    () =>
      resolveAvailableInspectorKinds({
        hasConversationSlot: hasConversationInspectorSlot,
      }),
    [hasConversationInspectorSlot],
  );

  useEffect(() => {
    setInspectorTabIntent(readPersistedInspectorTabLayout());
    setHasLoadedInspectorTabs(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedInspectorTabs) {
      return;
    }

    if (!inspectorTabIntent) {
      return;
    }

    persistInspectorTabLayout(inspectorTabIntent);
  }, [hasLoadedInspectorTabs, inspectorTabIntent]);
  const isInspectorComposerOwnerState = isInspectorComposerOwner(
    hasConversationInspectorSlot,
    state === 'overlay',
  );
  const inspectorTabLayout = resolveInspectorTabLayout({
    available: availableInspectorKinds,
    hasConversationSlot: hasConversationInspectorSlot,
    intent: inspectorTabIntent,
    isComposerOwner: isInspectorComposerOwnerState,
  });
  const applyInspectorKind = useCallback(
    (kind: WorkspaceInspectorAssetKind, mode: 'close' | 'open' | 'toggle') => {
      setInspectorTabIntent((intent) => {
        const current = resolveInspectorTabLayout({
          available: availableInspectorKinds,
          hasConversationSlot: hasConversationInspectorSlot,
          intent,
          isComposerOwner: isInspectorComposerOwnerState,
        });

        if (mode === 'close') {
          return closeInspectorKind(
            current,
            kind,
            isInspectorComposerOwnerState,
          );
        }

        if (mode === 'toggle') {
          return toggleInspectorKind(
            current,
            kind,
            availableInspectorKinds,
            isInspectorComposerOwnerState,
          );
        }

        return openInspectorKind(current, kind, availableInspectorKinds);
      });
    },
    [
      availableInspectorKinds,
      hasConversationInspectorSlot,
      isInspectorComposerOwnerState,
    ],
  );

  useEffect(() => {
    const openContextTab = () => {
      applyInspectorKind('context', 'open');
    };
    const openConversationTab = () => {
      applyInspectorKind('conversation', 'open');
      if (window.matchMedia('(max-width: 1279px)').matches) {
        setIsMobileInspectorOpen(true);
      }
    };
    const openFilesTab = () => {
      applyInspectorKind('files', 'open');
    };
    const openBrowserTab = () => {
      applyInspectorKind('browser', 'open');
    };
    window.addEventListener(OPEN_CONTEXT_TAB_EVENT, openContextTab);
    window.addEventListener(OPEN_CONVERSATION_TAB_EVENT, openConversationTab);
    window.addEventListener(OPEN_FILES_TAB_EVENT, openFilesTab);
    window.addEventListener(OPEN_BROWSER_TAB_EVENT, openBrowserTab);
    return () => {
      window.removeEventListener(OPEN_CONTEXT_TAB_EVENT, openContextTab);
      window.removeEventListener(
        OPEN_CONVERSATION_TAB_EVENT,
        openConversationTab,
      );
      window.removeEventListener(OPEN_FILES_TAB_EVENT, openFilesTab);
      window.removeEventListener(OPEN_BROWSER_TAB_EVENT, openBrowserTab);
    };
  }, [applyInspectorKind, setIsMobileInspectorOpen]);
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
  // 3) topbar-selected brand — so Publishing/Overview threads get a brand without
  //    an adapter. Without this, chat runs brandless and the model asks "which
  //    brand?" even though the brand switcher already has a selection.
  const surfaceBrandId = productSurfaceAdapter?.scope.brandId;
  const topbarBrandId = brandId || null;
  const bindingBrandId =
    surfaceBrandId ?? resolvedWorkspaceSurfaceAdapter?.brandId ?? topbarBrandId;
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
  const isWorkflowInspectorSurface =
    WORKFLOW_INSPECTOR_SURFACE_KEYS.has(surfaceKey) &&
    workflowSurfaceRoute.workflowBaseHref !== null;
  // The composer follows the conversation surface. `/agent/*` owns the canvas,
  // so its composer stays there. Every product route keeps its canvas clear and
  // hosts the composer with the conversation in the inspector. Registered
  // overlays temporarily take portal ownership from either base region.
  const isCanvasComposerVisible = state !== 'overlay' && isAgentRoute;
  const draftScopeKey = `${orgSlug || 'unknown'}:${effectiveThreadId ?? 'new'}:${activeThread?.contextVersion ?? 0}`;
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
    searchParams: new URLSearchParams(searchParamsString),
  });
  const effectiveSurfaceAdapter =
    activeSurfaceAdapter?.surfaceKey === surfaceKey
      ? activeSurfaceAdapter
      : null;
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
    runAgentApiEffect(
      agentApiService.updateThreadContextEffect(
        activeThreadIdForScope,
        {
          brandId: targetSyncBrandId,
          expectedContextVersion: activeThreadContextVersion,
        },
        abortController.signal,
      ),
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

  const handleReturnToConversation = useCallback(() => {
    pendingTransitionRef.current = 'conversation_return';
    push(fullConversationHref);
  }, [fullConversationHref, push]);

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

  const handleOpenOverlay = useCallback(() => {
    launchWorkspaceOverlay({
      key: 'shell-preview',
      parameters: { reference: null },
    });
  }, [launchWorkspaceOverlay]);

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
        href(APP_ROUTES.PUBLISHING.REMIX),
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

    return () => {
      layoutRoot.style.removeProperty('--workspace-inspector-width');
    };
  }, [inspectorRailWidth]);

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

  // Exactly one conversation may be mounted at a time: each one portals its
  // prompt bar into the single shell composer slot, so a second copy would put
  // two prompt bars in one slot.
  //
  // `/agent/*` is the first owner — it renders the conversation as its own
  // canvas. Off that route the inspector owns it, and between the inspector's
  // two hosts the mobile drawer wins while it is open: its opener is the
  // topbar toggle's `xl:hidden` variant, so it can only be open at widths
  // where the desktop rail is display:none anyway.
  const conversationInspectorSlot = isAgentRoute ? null : (
    <ConversationInspectorPanel
      apiService={agentApiService}
      onOpenConversation={handleReturnToConversation}
    />
  );

  const inspectorSharedProps = {
    actions: {
      onCloseInspectorKind: (kind: WorkspaceInspectorTab) => {
        applyInspectorKind(kind, 'close');
      },
      onOpenOverlay: handleOpenOverlay,
      onOpenWorkflowPicker: handleOpenWorkflowPicker,
      onReturnToConversation: handleReturnToConversation,
      onSelectInspectorTab: (tab: WorkspaceInspectorTab) => {
        applyInspectorKind(tab, 'open');
      },
      onSetComposerPortalTarget: setComposerPortalTarget,
      onToggleInspectorKind: (kind: WorkspaceInspectorTab) => {
        applyInspectorKind(kind, 'toggle');
      },
      pendingTransitionRef,
    },
    adapters: {
      effectiveSurfaceAdapter,
      productSurfaceAdapter,
      researchSurfaceAdapter: activeResearchSurfaceAdapter,
      surfacePresentationAdapter: resolvedSurfacePresentationAdapter,
      workspaceSurfaceAdapter: resolvedWorkspaceSurfaceAdapter,
    },
    chrome: {
      availableInspectorKinds,
      hasAgentInspectorPanel,
      inspectorBreadcrumbLabel,
      inspectorScope: conversationScope.inspectorScope,
      inspectorTab: inspectorTabLayout.activeKind,
      inspectorTabLayout,
      isComposerOwner: isInspectorComposerOwnerState,
    },
    route: {
      activeThreadContextVersion: activeThread?.contextVersion,
      effectiveThreadId,
      fullConversationHref,
      isAgentRoute,
      isOverlayState: state === 'overlay',
      isWorkflowInspectorSurface,
      rawPathname,
      searchParamsString,
    },
  };

  return (
    <ConversationInspectorShellProvider
      // Only the conversation-as-surface may project its context panels into
      // the rail. Off `/agent/*` the conversation is rendered *inside* that
      // rail, so letting it portal there too would have it replace the canvas
      // context tab with its own — and, at the tab level, itself.
      isActive={isAgentRoute}
      onPanelPresenceChange={setHasAgentInspectorPanel}
      portalTarget={agentInspectorPortalTarget}
    >
      <ConversationComposerShellProvider
        artifactReferences={
          surfaceReferences ??
          resolvedWorkspaceSurfaceAdapter?.artifactReferences
        }
        brandId={
          isSurfaceScopeAligned ? (bindingBrandId ?? undefined) : undefined
        }
        contextLabel={composerContextLabel}
        dispatchAction={handleComposerAction}
        draftScopeKey={draftScopeKey}
        isConsequentiallyBlocked={conversationScope.isConsequentiallyBlocked}
        isComposerVisible
        placement={
          state === 'overlay'
            ? 'overlay'
            : isAgentRoute
              ? 'surface'
              : 'inspector'
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
          className="relative min-h-[calc(100dvh-var(--desktop-titlebar-height)-3rem)] overflow-hidden bg-background"
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
            className="h-[calc(100dvh-var(--desktop-titlebar-height)-3rem)] min-h-0"
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
                    {children}
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
            </div>

            {/* Full-height rail, mirroring the left navigation sidebar: fixed to the
              viewport edge, flush from titlebar to bottom, square, same surface
              colour, same 300ms curve on width and min-width. Collapsed it goes
              to zero — border included, or a 1px line survives at width 0. The
              topbar and main content reserve space for it through
              --workspace-inspector-width, which is how the rail pushes content. */}
            {isFocusedOnboardingRoute ? null : (
              <aside
                aria-label="Workspace inspector"
                className={cn(
                  'fixed right-0 bottom-0 z-30 hidden min-h-0 flex-col overflow-hidden bg-background xl:flex',
                  isInspectorOpen && 'border-l border-border',
                )}
                id="workspace-context-inspector"
                inert={!isInspectorOpen}
                ref={inspectorRef}
                style={{
                  minWidth: inspectorRailWidth,
                  top: 'var(--desktop-titlebar-height)',
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
                    ariaLabel="Resize workspace inspector"
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
                  <WorkspaceInspectorContent
                    {...inspectorSharedProps}
                    agentPanelSlot={
                      isInspectorOpen ? (
                        <div
                          className="flex min-h-0 flex-1 flex-col empty:hidden"
                          ref={setAgentInspectorPortalTarget}
                        />
                      ) : null
                    }
                    conversationSlot={
                      isMobileInspectorOpen ? null : conversationInspectorSlot
                    }
                  />
                </div>
              </aside>
            )}
          </div>

          {isFocusedOnboardingRoute ? null : (
            <Drawer
              open={isMobileInspectorOpen}
              onOpenChange={setIsMobileInspectorOpen}
            >
              <DrawerContent
                className="max-h-[85vh] rounded-t-[var(--radius-workspace-overlay)]"
                id="workspace-context-inspector-drawer"
              >
                <DrawerHeader>
                  <DrawerTitle>
                    {WORKSPACE_INSPECTOR_CHROME.mobileDrawerTitle}
                  </DrawerTitle>
                  <DrawerDescription>
                    {WORKSPACE_INSPECTOR_CHROME.mobileDrawerDescription}
                  </DrawerDescription>
                </DrawerHeader>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <WorkspaceInspectorContent
                    {...inspectorSharedProps}
                    agentPanelSlot={null}
                    conversationSlot={conversationInspectorSlot}
                  />
                </div>
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
    </ConversationInspectorShellProvider>
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
          <WorkspaceInspectorPreviewProvider>
            <UniversalWorkspaceShellContent
              agentApiService={agentApiService}
              composerScopeControls={composerScopeControls}
            >
              {children}
            </UniversalWorkspaceShellContent>
          </WorkspaceInspectorPreviewProvider>
        </AnalyticsWorkspaceSurfaceAdapterProvider>
      </WorkspaceSurfaceAdapterProvider>
    </AgentWorkspaceLayoutClient>
  );
}
