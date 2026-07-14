'use client';

import { AgentWorkspaceLayoutClient } from '@app/(protected)/[orgSlug]/~/agent/AgentWorkspaceLayoutClient';
import { AgentWorkspacePageShell } from '@app/(protected)/[orgSlug]/~/agent/AgentWorkspacePageShell';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  type AgentApiService,
  type ConversationComposerActionInvocation,
  type ConversationComposerDispatchResult,
  ConversationComposerShellProvider,
  getConversationComposerAction,
  runAgentApiEffect,
  useAgentChatStore,
} from '@genfeedai/agent';
import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  AgentArtifactReference,
  WorkspaceShellOverlayRequest,
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
  HiOutlineArrowLeft,
  HiOutlineBolt,
  HiOutlineChatBubbleLeftRight,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
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
  buildWorkspaceShellHref,
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
  captureWorkspaceShellRestorationFailure,
  captureWorkspaceShellTransition,
} from '@/lib/workspace-shell/workspace-shell-telemetry';
import { resolveWorkspaceSurfaceLaunch } from '@/lib/workspace-shell/workspace-surface-launcher';
import { useConversationScopeControls } from './use-conversation-scope-controls';
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
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isMobileInspectorOpen, setIsMobileInspectorOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  const [composerPortalTarget, setComposerPortalTarget] =
    useState<HTMLElement | null>(null);
  const [failedSurfaceScopeKey, setFailedSurfaceScopeKey] = useState<
    string | null
  >(null);
  const [researchSurfaceAdapter, setResearchSurfaceAdapter] = useState<{
    readonly registration: ResearchWorkspaceSurfaceAdapterRegistration;
    readonly token: symbol;
  } | null>(null);
  const primaryRegionRef = useRef<HTMLElement>(null);
  const previousActiveThreadIdRef = useRef(activeThreadId);
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
          normalizedPathname,
          pathname: rawPathname,
          searchParams: new URLSearchParams(searchParamsString),
        }),
      ),
    [normalizedPathname, rawPathname, searchParamsString],
  );

  const {
    baseState,
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
  const isUnthreadedConversation =
    baseState === 'conversation' &&
    (normalizedPathname === APP_ROUTES.AGENT.ROOT ||
      normalizedPathname === APP_ROUTES.AGENT.NEW);
  const routeScope = rawPathname.split('/').filter(Boolean)[0] ?? '';
  const retainedThreadIdRef = useRef<string | null>(threadId);
  const previousRouteScopeRef = useRef(routeScope);
  const isSameRouteScope = previousRouteScopeRef.current === routeScope;
  const effectiveThreadId =
    threadId ??
    (baseState === 'canvas' && isSameRouteScope
      ? retainedThreadIdRef.current
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
  const draftScopeKey = `${orgSlug || 'unknown'}:${effectiveThreadId ?? 'new'}:${activeThread?.contextVersion ?? 0}`;
  const shellContextLabel =
    resolvedSurfacePresentationAdapter?.contextLabel ??
    (state === 'conversation'
      ? 'Conversation'
      : state === 'overlay'
        ? 'Overlay · conversation connected'
        : `Canvas · ${shellLocation.routeKey.replace(/^canvas:/, '')}`);
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
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setFailedSurfaceScopeKey(surfaceScopeKey);
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
    if (baseState === 'conversation') {
      retainedThreadIdRef.current = null;
      return;
    }
    if (!hasScopeChanged && effectiveThreadId && isCanonical) {
      replace(
        buildWorkspaceShellHref(currentHref, {
          threadId: effectiveThreadId,
        }),
      );
    }
  }, [
    baseState,
    currentHref,
    effectiveThreadId,
    isCanonical,
    replace,
    routeScope,
    threadId,
  ]);

  useEffect(() => {
    const previousActiveThreadId = previousActiveThreadIdRef.current;
    previousActiveThreadIdRef.current = activeThreadId;

    if (
      baseState !== 'canvas' ||
      !isCanonical ||
      threadId ||
      !activeThreadId ||
      activeThreadId === previousActiveThreadId
    ) {
      return;
    }

    replace(
      buildWorkspaceShellHref(currentHref, {
        threadId: activeThreadId,
      }),
    );
  }, [activeThreadId, baseState, currentHref, isCanonical, replace, threadId]);

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

    if (state !== 'overlay') {
      isOwnedOverlayEntryRef.current = false;
      const shouldRestoreOverlayTrigger =
        previousState === 'overlay' && hasOverlayReturnFocusRef.current;
      if (previousState !== null && !shouldRestoreOverlayTrigger) {
        primaryRegionRef.current?.focus({ preventScroll: true });
      }
      hasOverlayReturnFocusRef.current = false;
    }
  }, [normalizedPathname, state]);

  const handleOpenCanvas = useCallback(() => {
    const launch = resolveWorkspaceSurfaceLaunch({
      currentHref,
      destinationHref: brandSlug
        ? href(APP_ROUTES.WORKSPACE.OVERVIEW)
        : orgHref('/overview'),
      threadId: effectiveThreadId ?? activeThreadId,
    });
    if (launch.history !== 'push' || launch.mode !== 'canvas') {
      return;
    }

    pendingTransitionRef.current = 'canvas_launch';
    push(launch.href);
  }, [
    activeThreadId,
    brandSlug,
    currentHref,
    effectiveThreadId,
    href,
    orgHref,
    push,
  ]);

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
      handleDismissOverlay();
    },
    [activeThreadId, effectiveThreadId, handleDismissOverlay, seedComposer],
  );

  const handleInspectorResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = inspectorWidth;

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
    [inspectorWidth],
  );

  const handleInspectorResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 32 : 16;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setInspectorWidth((width) => clampInspectorWidth(width + step));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setInspectorWidth((width) => clampInspectorWidth(width - step));
      }
    },
    [],
  );

  const inspectorContent = (
    <div className="flex h-full min-h-0 flex-col bg-background-secondary">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
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
        <Button
          ariaLabel="Collapse context inspector"
          className="hidden size-7 xl:inline-flex"
          icon={<HiOutlineChevronRight className="size-4" />}
          onClick={() => setIsInspectorOpen(false)}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
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
        ) : (
          <div
            className="gen-shell-empty-state p-4"
            data-testid={
              resolvedWorkspaceSurfaceAdapter
                ? 'workspace-surface-adapter-inspector'
                : undefined
            }
          >
            <p className="text-sm font-medium text-foreground">
              {resolvedWorkspaceSurfaceAdapter
                ? resolvedWorkspaceSurfaceAdapter.registration.title
                : `Registered ${surfaceKey} adapter slot`}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {resolvedWorkspaceSurfaceAdapter
                ? resolvedWorkspaceSurfaceAdapter.registration.description
                : 'Product-owned context adapters land here without changing their canonical route or granting execution authority.'}
            </p>
            {resolvedWorkspaceSurfaceAdapter ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Full management remains available on this canonical route.
              </p>
            ) : null}
          </div>
        )}
        <Button
          icon={<HiOutlineBolt className="size-4" />}
          onClick={handleOpenWorkflowPicker}
          variant={ButtonVariant.OUTLINE}
          withWrapper={false}
        >
          Choose workflow
        </Button>
        {effectiveSurfaceAdapter ||
        resolvedSurfacePresentationAdapter ? null : (
          <Button
            icon={<HiOutlineEye className="size-4" />}
            onClick={handleOpenOverlay}
            variant={ButtonVariant.OUTLINE}
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
      </div>
    </div>
  );

  return (
    <ConversationComposerShellProvider
      artifactReferences={
        surfaceReferences ?? resolvedWorkspaceSurfaceAdapter?.artifactReferences
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
        className="relative min-h-[calc(100dvh-var(--desktop-titlebar-height)-3rem)] overflow-hidden bg-background p-2"
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
          className="h-[calc(100dvh-var(--desktop-titlebar-height)-4rem)] min-h-0 gap-2 xl:grid xl:grid-cols-[minmax(0,1fr)_auto]"
          data-testid="workspace-shell-regions"
        >
          <div className="relative h-full min-h-0 min-w-0">
            <div
              aria-hidden={baseState !== 'conversation'}
              className={cn(
                'gen-workspace-shell-region-emphasis h-full min-h-0 overflow-hidden bg-background shadow-border',
                baseState !== 'conversation' && 'hidden',
              )}
              data-testid="workspace-conversation-region"
              inert={baseState !== 'conversation'}
            >
              <div className="flex h-11 items-center justify-between border-b border-border px-3">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Conversation
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    className="xl:hidden"
                    icon={<HiOutlineViewColumns className="size-4" />}
                    onClick={() => setIsMobileInspectorOpen(true)}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  >
                    Context
                  </Button>
                  <Button
                    icon={<HiOutlineSquares2X2 className="size-4" />}
                    onClick={handleOpenCanvas}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  >
                    Open workspace canvas
                  </Button>
                </div>
              </div>
              <section
                aria-label="Primary conversation workspace"
                className="flex h-[calc(100%-2.75rem)] min-h-0"
                ref={
                  baseState === 'conversation' ? primaryRegionRef : undefined
                }
                tabIndex={-1}
              >
                <AgentWorkspacePageShell
                  threadId={effectiveThreadId ?? undefined}
                />
              </section>
            </div>

            <section
              aria-hidden={baseState !== 'canvas'}
              aria-label="Primary workspace canvas"
              className={cn(
                'gen-workspace-shell-region-emphasis h-full min-w-0 bg-background shadow-border',
                workflowSurfaceRoute.isGraphCanvas
                  ? 'overflow-hidden'
                  : 'overflow-auto pb-48 md:pb-56',
                baseState !== 'canvas' && 'hidden',
              )}
              data-testid="workspace-canvas-layout"
              inert={baseState !== 'canvas'}
              ref={baseState === 'canvas' ? primaryRegionRef : undefined}
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
                  Context
                </Button>
              </div>
              <ResearchWorkspaceSurfaceAdapterRegistrationContext.Provider
                value={registerSurfaceAdapter}
              >
                {baseState === 'canvas' ? (
                  <WorkspaceShellActionsProvider
                    openOverlay={launchWorkspaceOverlay}
                  >
                    {children}
                  </WorkspaceShellActionsProvider>
                ) : null}
              </ResearchWorkspaceSurfaceAdapterRegistrationContext.Provider>
            </section>

            {state !== 'overlay' ? (
              <div
                className="pointer-events-none absolute inset-x-3 bottom-3 z-40 md:inset-x-5 md:bottom-5"
                data-testid="workspace-composer-slot"
              >
                <div
                  className="pointer-events-auto"
                  ref={setComposerPortalTarget}
                />
              </div>
            ) : null}
          </div>

          <aside
            aria-label="Context inspector"
            className={cn(
              'gen-workspace-shell-region relative hidden min-h-0 overflow-hidden bg-background-secondary shadow-border transition-[width] duration-300 xl:block',
              !isInspectorOpen && 'w-12',
            )}
            style={isInspectorOpen ? { width: inspectorWidth } : undefined}
          >
            {isInspectorOpen ? (
              <>
                <Button
                  aria-orientation="vertical"
                  aria-valuemax={INSPECTOR_MAX_WIDTH}
                  aria-valuemin={INSPECTOR_MIN_WIDTH}
                  aria-valuenow={inspectorWidth}
                  ariaLabel="Resize context inspector"
                  className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize"
                  onKeyDown={handleInspectorResizeKeyDown}
                  onMouseDown={handleInspectorResizeStart}
                  role="separator"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                />
                {inspectorContent}
              </>
            ) : (
              <div className="flex h-full flex-col items-center pt-3">
                <Button
                  ariaLabel="Expand context inspector"
                  className="size-8"
                  icon={<HiOutlineChevronLeft className="size-4" />}
                  onClick={() => setIsInspectorOpen(true)}
                  size={ButtonSize.ICON}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              </div>
            )}
          </aside>
        </div>

        <Drawer
          open={isMobileInspectorOpen}
          onOpenChange={setIsMobileInspectorOpen}
        >
          <DrawerContent className="max-h-[85vh] rounded-t-[var(--radius-workspace-overlay)]">
            <DrawerHeader>
              <DrawerTitle>Context inspector</DrawerTitle>
              <DrawerDescription>
                Context for the active canonical product route.
              </DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto">{inspectorContent}</div>
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
          threadId={effectiveThreadId ?? activeThreadId}
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
