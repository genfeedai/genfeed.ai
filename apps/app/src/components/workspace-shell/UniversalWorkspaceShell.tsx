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
  runAgentApiEffect,
  useAgentChatStore,
} from '@genfeedai/agent';
import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant, CardEmptySize } from '@genfeedai/enums';
import type {
  AgentArtifactReference,
  WorkspaceShellOverlayRequest,
} from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { Button } from '@ui/primitives/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@ui/primitives/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/primitives/tabs';
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
  HiOutlineArrowLeft,
  HiOutlineBolt,
  HiOutlineChatBubbleLeftRight,
  HiOutlineEye,
  HiOutlineSquares2X2,
  HiOutlineViewColumns,
} from 'react-icons/hi2';
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
import { WorkflowSurfaceInspector } from '@/features/workflows/workspace/WorkflowSurfaceInspector';
import { resolveWorkflowSurfaceRoute } from '@/features/workflows/workspace/workflow-surface-routing';
import {
  appendSearchParamsToHref,
  normalizeProtectedPathname,
} from '@/lib/navigation/operator-shell';
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
import { resolveWorkspaceSurfaceLaunch } from '@/lib/workspace-shell/workspace-surface-launcher';
import { useConversationScopeControls } from './use-conversation-scope-controls';
import {
  useRegisterWorkspaceInspector,
  useWorkspaceInspector,
} from './WorkspaceInspectorContext';
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
// sidebar. The only toggle then lives in the topbar (WorkspaceInspectorContext).
const INSPECTOR_COLLAPSED_WIDTH = 0;
// Motion parity with DesktopSidebar — same duration, same curve, both axes.
const INSPECTOR_TRANSITION_DURATION_MS = 300;
const INSPECTOR_TRANSITION_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const INSPECTOR_RAIL_TRANSITION = `width ${INSPECTOR_TRANSITION_DURATION_MS}ms ${INSPECTOR_TRANSITION_EASING}, min-width ${INSPECTOR_TRANSITION_DURATION_MS}ms ${INSPECTOR_TRANSITION_EASING}`;

type WorkspaceInspectorTab = 'context' | 'conversation';

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
  const { brandId, organizationId } = useBrand();
  const { brandSlug, href, orgHref, orgSlug } = useOrgUrl();
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const activeSurfaceAdapter = useActiveAnalyticsWorkspaceSurfaceAdapter();
  const threads = useAgentChatStore((state) => state.threads);
  const updateThread = useAgentChatStore((state) => state.updateThread);
  const seedComposer = useAgentChatStore((state) => state.seedComposer);
  const activeWorkspaceSurfaceAdapter = useActiveWorkspaceSurfaceAdapter();
  const activeSurfacePresentationAdapter =
    useActiveWorkspaceSurfacePresentationAdapter();
  // The topbar owns the inspector toggle, so open state is shared through a
  // provider that sits above AppLayout. The shell also renders standalone (unit
  // tests, non-protected layouts) where there is no toggle at all, so it defaults
  // to expanded there.
  const workspaceInspector = useWorkspaceInspector();
  const isInspectorOpen = workspaceInspector?.isOpen ?? true;
  useRegisterWorkspaceInspector();
  const [isMobileInspectorOpen, setIsMobileInspectorOpen] = useState(false);
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
  // The rail carries two things now: the conversation, reachable from every
  // surface, and the surface's own context. Conversation leads — that is the
  // whole point of it no longer being a shell state you navigate away to.
  const [inspectorTab, setInspectorTab] =
    useState<WorkspaceInspectorTab>('conversation');
  const [failedSurfaceScopeKey, setFailedSurfaceScopeKey] = useState<
    string | null
  >(null);
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

  const normalizedPathname = useMemo(
    () => normalizeProtectedPathname(rawPathname),
    [rawPathname],
  );
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
  const surfaceBrandId = productSurfaceAdapter?.scope.brandId;
  const isSurfaceScopeAligned = Boolean(
    !activeThread || !surfaceBrandId || activeThread.brandId === surfaceBrandId,
  );
  const surfaceScopeKey =
    activeThread && surfaceBrandId && !isSurfaceScopeAligned
      ? `${activeThread.id}:${activeThread.contextVersion}:${surfaceBrandId}`
      : null;
  const surfaceScopeStatus = !surfaceScopeKey
    ? 'ready'
    : failedSurfaceScopeKey === surfaceScopeKey
      ? 'error'
      : 'syncing';
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
      !surfaceBrandId ||
      !surfaceScopeKey
    ) {
      return;
    }

    const abortController = new AbortController();
    runAgentApiEffect(
      agentApiService.updateThreadContextEffect(
        activeThreadIdForScope,
        {
          brandId: surfaceBrandId,
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
          setFailedSurfaceScopeKey(surfaceScopeKey);
          captureWorkspaceShellScopeCorrection('failure');
          captureWorkspaceShellError('scope', 'scope_sync_failed');
        }
      });

    return () => abortController.abort();
  }, [
    activeThreadContextVersion,
    activeThreadIdForScope,
    agentApiService,
    surfaceBrandId,
    surfaceScopeKey,
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
    const transition =
      pendingTransitionRef.current ??
      (previousState === null
        ? 'initial_restore'
        : previousState === 'canvas' &&
            state === 'canvas' &&
            previousPathname !== normalizedPathname
          ? 'canvas_change'
          : 'browser');

    captureWorkspaceShellTransition({
      fromState: previousState ?? state,
      toState: state,
      transition,
    });
    previousPathnameRef.current = normalizedPathname;
    previousStateRef.current = state;
    pendingTransitionRef.current = null;

    if (state === 'overlay' && overlayRegistration) {
      activeOverlayTelemetryClassRef.current =
        overlayRegistration.telemetryClass;
      if (previousState !== 'overlay') {
        overlayCompletedRef.current = false;
      }
    } else if (previousState === 'overlay') {
      if (
        activeOverlayTelemetryClassRef.current &&
        !overlayCompletedRef.current
      ) {
        captureWorkspaceShellOverlayAbandonment(
          activeOverlayTelemetryClassRef.current,
        );
      }
      activeOverlayTelemetryClassRef.current = null;
      overlayCompletedRef.current = false;
    }

    if (state !== 'overlay') {
      isOwnedOverlayEntryRef.current = false;
      const shouldRestoreOverlayTrigger =
        previousState === 'overlay' && hasOverlayReturnFocusRef.current;
      if (previousState !== null && !shouldRestoreOverlayTrigger) {
        primaryRegionRef.current?.focus({ preventScroll: true });
      }
      hasOverlayReturnFocusRef.current = false;
    }
  }, [normalizedPathname, overlayRegistration, state]);

  const handleReturnToConversation = useCallback(() => {
    pendingTransitionRef.current = 'conversation_return';
    const destinationThreadId = effectiveThreadId ?? activeThreadId;
    push(
      orgHref(
        destinationThreadId
          ? `${APP_ROUTES.AGENT.ROOT}/${destinationThreadId}`
          : APP_ROUTES.AGENT.ROOT,
      ),
    );
  }, [activeThreadId, effectiveThreadId, orgHref, push]);

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
      const trustedAction = getConversationComposerAction(
        invocation.action.name,
      );
      if (conversationScope.isConsequentiallyBlocked) {
        return {
          message:
            'Synchronize the server-authoritative conversation scope before opening consequential actions. Your draft is unchanged.',
          status: 'unauthorized',
        };
      }
      if (
        !trustedAction ||
        trustedAction.route !== invocation.action.route ||
        trustedAction.requiredScope !== invocation.action.requiredScope
      ) {
        return {
          message:
            'That action is not registered. Your draft and references are unchanged.',
          status: 'unavailable',
        };
      }

      if (trustedAction.name === 'workflow') {
        if (!activeThread?.brandId) {
          return {
            message:
              '/workflow needs an active thread brand. Select a brand through the scoped controls; your draft has been preserved.',
            status: 'unauthorized',
          };
        }

        return handleOpenWorkflowPicker()
          ? {
              message:
                'Opened the authorized workflow picker. Choose a workflow to attach it or open its focused editor.',
              status: 'dispatched',
            }
          : {
              message:
                'The workflow picker is unavailable. Your draft and references are unchanged.',
              status: 'unavailable',
            };
      }

      if (trustedAction.requiredScope === 'brand' && !brandSlug) {
        return {
          message: `/${trustedAction.name} needs an explicit brand route. Select a brand through the scoped controls; your draft has been preserved.`,
          status: 'unauthorized',
        };
      }

      if (trustedAction.name === 'remix') {
        const didOpen = launchWorkspaceOverlay({
          key: 'library-picker',
          parameters: {},
        });
        return didOpen
          ? {
              message:
                'Opened the authorized Library picker. Your draft and active thread are preserved.',
              status: 'dispatched',
            }
          : {
              message:
                'The Library picker is unavailable. Your draft and references are unchanged.',
              status: 'unavailable',
            };
      }

      const destination =
        trustedAction.requiredScope === 'brand'
          ? href(trustedAction.route)
          : orgHref(trustedAction.route);
      const launch = resolveWorkspaceSurfaceLaunch({
        currentHref,
        destinationHref: destination,
        threadId: effectiveThreadId ?? activeThreadId,
      });
      if (launch.history !== 'push' || launch.mode !== 'canvas') {
        return {
          message:
            'That product surface is unavailable. Your draft and references are unchanged.',
          status: 'unavailable',
        };
      }

      pendingTransitionRef.current = 'canvas_launch';
      push(launch.href);

      return {
        message: trustedAction.isConsequentialProposal
          ? `Opened ${trustedAction.label}. Your draft is preserved; execution still requires the product's explicit typed confirmation and authorization.`
          : `Opened ${trustedAction.label}. Your draft and references are preserved.`,
        status: 'dispatched',
      };
    },
    [
      activeThreadId,
      activeThread?.brandId,
      brandSlug,
      conversationScope.isConsequentiallyBlocked,
      currentHref,
      effectiveThreadId,
      href,
      handleOpenWorkflowPicker,
      launchWorkspaceOverlay,
      orgHref,
      push,
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
        href(APP_ROUTES.POSTS.REMIX),
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
        workflow ? `/workflows/${workflow._id}` : '/workflows',
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
        `Use the deterministic workflow “${workflow.name}” (workflow ID: ${workflow._id}) for this request: `,
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

  // The rail is fixed-positioned, so it no longer occupies a grid track. Publish
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
  // two hosts the mobile drawer wins while it is open: its trigger lives in an
  // `xl:hidden` bar, so it can only be open at widths where the desktop rail is
  // display:none anyway.
  const conversationInspectorSlot = isAgentRoute ? null : (
    <ConversationInspectorPanel
      apiService={agentApiService}
      onOpenConversation={handleReturnToConversation}
    />
  );

  // Rendered at two sites (desktop rail + mobile drawer), so this stays a
  // function: only the desktop rail may own the agent portal target, otherwise
  // the ref callback would race between two mounted copies.
  const renderInspectorContent = (
    agentPanelSlot: ReactNode = null,
    conversationSlot: ReactNode = null,
  ) => {
    const isAgentOwned = agentPanelSlot !== null && hasAgentInspectorPanel;
    const activeInspectorTab = conversationSlot ? inspectorTab : 'context';
    const isInspectorComposerOwner =
      conversationSlot !== null && state !== 'overlay';

    return (
      <Tabs
        className="flex h-full min-h-0 flex-col bg-background"
        onValueChange={(value) =>
          setInspectorTab(value === 'conversation' ? 'conversation' : 'context')
        }
        value={activeInspectorTab}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          {conversationSlot ? (
            <TabsList className="h-8">
              <TabsTrigger value="conversation">Conversation</TabsTrigger>
              <TabsTrigger value="context">Context</TabsTrigger>
            </TabsList>
          ) : (
            <div>
              <p className="text-sm font-medium text-foreground">Context</p>
              <p className="text-xs text-muted-foreground">
                {surfaceScopeStatus === 'syncing'
                  ? 'Synchronizing surface brand…'
                  : surfaceScopeStatus === 'error'
                    ? 'Surface brand synchronization failed'
                    : effectiveThreadId
                      ? 'Conversation connected'
                      : 'No conversation selected'}
              </p>
            </div>
          )}
          {/* No collapse control here: the rail collapses to nothing, so the one
            toggle is pinned in the topbar instead of disappearing with it. */}
        </div>

        {/* `forceMount` on both panes: switching tabs must not unmount the
          conversation, or its prompt bar would vanish from the shell composer
          and an in-flight run would lose its transcript. */}
        {conversationSlot ? (
          <TabsContent
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            forceMount
            value="conversation"
          >
            {conversationSlot}
            {isInspectorComposerOwner ? (
              <div
                className="shrink-0 border-t border-border p-2"
                data-testid="workspace-inspector-composer-slot"
                ref={setComposerPortalTarget}
              />
            ) : null}
          </TabsContent>
        ) : null}

        <TabsContent
          className={cn(
            'mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto data-[state=inactive]:hidden',
            !isAgentOwned && 'gap-4 p-4',
          )}
          forceMount
          value="context"
        >
          {agentPanelSlot}
          {isAgentOwned ? null : isAgentRoute ? (
            <p className="px-1 text-xs leading-5 text-muted-foreground">
              Context from the active conversation appears here as the agent
              works.
            </p>
          ) : (
            <>
              {conversationScope.inspectorScope}
              {productSurfaceAdapter ? (
                productSurfaceAdapter.renderInspector()
              ) : surfaceKey === 'workflows' ? (
                <WorkflowSurfaceInspector
                  contextVersion={activeThread?.contextVersion}
                  pathname={rawPathname}
                  searchParams={new URLSearchParams(searchParamsString)}
                  threadId={effectiveThreadId}
                />
              ) : effectiveSurfaceAdapter ? (
                effectiveSurfaceAdapter.inspectorContent
              ) : activeResearchSurfaceAdapter ? (
                activeResearchSurfaceAdapter.inspectorContent
              ) : resolvedSurfacePresentationAdapter ? (
                resolvedSurfacePresentationAdapter.inspector
              ) : resolvedWorkspaceSurfaceAdapter ? (
                <div
                  className="gen-shell-empty-state p-4"
                  data-testid="workspace-surface-adapter-inspector"
                >
                  <p className="text-sm font-medium text-foreground">
                    {resolvedWorkspaceSurfaceAdapter.registration.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {resolvedWorkspaceSurfaceAdapter.registration.description}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Full management remains available on this canonical route.
                  </p>
                </div>
              ) : (
                <CardEmptyContent
                  className="gen-shell-empty-state rounded-lg py-8"
                  description={`Start a conversation or choose a workflow to build ${inspectorBreadcrumbLabel} context here.`}
                  icon={HiOutlineSquares2X2}
                  label={`No ${inspectorBreadcrumbLabel} context yet`}
                  size={CardEmptySize.SM}
                />
              )}
              <Button
                icon={<HiOutlineBolt className="size-4" />}
                onClick={handleOpenWorkflowPicker}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                Choose workflow
              </Button>
              {effectiveSurfaceAdapter ||
              resolvedSurfacePresentationAdapter ? null : (
                <Button
                  icon={<HiOutlineEye className="size-4" />}
                  onClick={handleOpenOverlay}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                >
                  Open overlay preview
                </Button>
              )}
              <Button
                icon={<HiOutlineChatBubbleLeftRight className="size-4" />}
                onClick={handleReturnToConversation}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              >
                Return to conversation
              </Button>
            </>
          )}
        </TabsContent>
      </Tabs>
    );
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
          isSurfaceScopeAligned
            ? (surfaceBrandId ?? resolvedWorkspaceSurfaceAdapter?.brandId)
            : undefined
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
                `/agent/*` renders the conversation as its page, every other
                route renders its own SaaS surface. The shell no longer swaps
                between a hard-wired conversation and the route's children. */}
              <section
                aria-label="Primary workspace canvas"
                className={cn(
                  'min-h-0 min-w-0 flex-1 bg-background focus:outline-none',
                  isAgentRoute || workflowSurfaceRoute.isGraphCanvas
                    ? 'overflow-hidden'
                    : 'overflow-auto',
                )}
                data-testid="workspace-canvas-layout"
                ref={primaryRegionRef}
                tabIndex={-1}
              >
                <div className="flex h-11 items-center justify-between border-b border-border px-3 xl:hidden">
                  <Button
                    icon={<HiOutlineArrowLeft className="size-4" />}
                    onClick={handleReturnToConversation}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  >
                    Conversation
                  </Button>
                  <Button
                    icon={<HiOutlineViewColumns className="size-4" />}
                    onClick={() => setIsMobileInspectorOpen(true)}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  >
                    Inspector
                  </Button>
                </div>
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

              {/* The conversation route owns the full canvas. Its composer is a
                bounded row beneath the transcript, so the canvas itself never
                scrolls and the prompt bar never covers starter panels or the
                final message. Product routes never render this slot. */}
              {isCanvasComposerVisible ? (
                <div
                  className="z-20 shrink-0 px-3 pb-3 md:px-5 md:pb-5"
                  data-testid="workspace-composer-slot"
                >
                  <div ref={setComposerPortalTarget} />
                </div>
              ) : null}
            </div>

            {/* Full-height rail, mirroring the left navigation sidebar: fixed to the
              viewport edge, flush from titlebar to bottom, square, same surface
              colour, same 300ms curve on width and min-width. Collapsed it goes
              to zero — border included, or a 1px line survives at width 0. The
              topbar and main content reserve space for it through
              --workspace-inspector-width, which is how the rail pushes content. */}
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
                {renderInspectorContent(
                  isInspectorOpen ? (
                    <div
                      className="flex min-h-0 flex-1 flex-col empty:hidden"
                      ref={setAgentInspectorPortalTarget}
                    />
                  ) : null,
                  isMobileInspectorOpen ? null : conversationInspectorSlot,
                )}
              </div>
            </aside>
          </div>

          <Drawer
            open={isMobileInspectorOpen}
            onOpenChange={setIsMobileInspectorOpen}
          >
            <DrawerContent className="max-h-[85vh] rounded-t-[var(--radius-workspace-overlay)]">
              <DrawerHeader>
                <DrawerTitle>Workspace inspector</DrawerTitle>
                <DrawerDescription>
                  Conversation and context for the active workspace surface.
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {renderInspectorContent(null, conversationInspectorSlot)}
              </div>
            </DrawerContent>
          </Drawer>

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
