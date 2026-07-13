'use client';

import { AgentWorkspaceLayoutClient } from '@app/(protected)/[orgSlug]/~/agent/AgentWorkspaceLayoutClient';
import { AgentWorkspacePageShell } from '@app/(protected)/[orgSlug]/~/agent/AgentWorkspacePageShell';
import { type AgentApiService, useAgentChatStore } from '@genfeedai/agent';
import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
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
  HiOutlineChatBubbleLeftRight,
  HiOutlineEye,
  HiOutlineSquares2X2,
  HiOutlineViewColumns,
} from 'react-icons/hi2';
import {
  appendSearchParamsToHref,
  normalizeProtectedPathname,
} from '@/lib/navigation/operator-shell';
import {
  buildWorkspaceShellHref,
  removeWorkspaceShellOverlayParams,
  restoreWorkspaceShellLocation,
  type WorkspaceShellLocation,
  type WorkspaceShellState,
} from '@/lib/workspace-shell/workspace-shell-location';
import {
  captureWorkspaceShellRestorationFailure,
  captureWorkspaceShellTransition,
} from '@/lib/workspace-shell/workspace-shell-telemetry';

const INSPECTOR_DEFAULT_WIDTH = 320;
const INSPECTOR_MIN_WIDTH = 256;
const INSPECTOR_MAX_WIDTH = 480;

type UniversalWorkspaceShellProps = {
  readonly agentApiService: AgentApiService;
  readonly children: ReactNode;
};

type UniversalWorkspaceShellContentProps = Pick<
  UniversalWorkspaceShellProps,
  'children'
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
  children,
}: UniversalWorkspaceShellContentProps) {
  const rawPathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const { back, push, replace } = useRouter();
  const { orgHref } = useOrgUrl();
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isMobileInspectorOpen, setIsMobileInspectorOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  const primaryRegionRef = useRef<HTMLElement>(null);
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
  const location = useMemo(
    () =>
      requireWorkspaceShellLocation(
        restoreWorkspaceShellLocation({
          normalizedPathname,
          searchParams: new URLSearchParams(searchParamsString),
        }),
      ),
    [normalizedPathname, searchParamsString],
  );

  const { baseState, state, threadId } = location;
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
    if (location.isCanonical) {
      return;
    }

    const canonicalHref = appendSearchParamsToHref(
      rawPathname,
      location.canonicalSearchParams,
    );
    if (location.restorationFailure) {
      captureWorkspaceShellRestorationFailure(location.restorationFailure);
    }
    replace(
      location.restorationFailure === 'invalid_thread'
        ? orgHref(APP_ROUTES.AGENT.ROOT)
        : canonicalHref,
    );
  }, [location, orgHref, rawPathname, replace]);

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
    if (!hasScopeChanged && effectiveThreadId && location.isCanonical) {
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
    location.isCanonical,
    replace,
    routeScope,
    threadId,
  ]);

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
    pendingTransitionRef.current = 'canvas_launch';
    push(
      buildWorkspaceShellHref(orgHref(APP_ROUTES.WORKSPACE.OVERVIEW), {
        threadId: effectiveThreadId ?? activeThreadId,
      }),
    );
  }, [activeThreadId, effectiveThreadId, orgHref, push]);

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

  const handleOpenOverlay = useCallback(() => {
    pendingTransitionRef.current = 'overlay_open';
    isOwnedOverlayEntryRef.current = true;
    overlayReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    hasOverlayReturnFocusRef.current = Boolean(overlayReturnFocusRef.current);
    push(
      buildWorkspaceShellHref(currentHref, {
        overlayKey: 'shell-preview',
      }),
    );
  }, [currentHref, push]);

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
            {effectiveThreadId
              ? 'Conversation connected'
              : 'No conversation selected'}
          </p>
        </div>
        <Button
          ariaLabel="Collapse context inspector"
          className="hidden size-7 xl:inline-flex"
          icon={<HiOutlineViewColumns className="size-4" />}
          onClick={() => setIsInspectorOpen(false)}
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="gen-shell-empty-state p-4">
          <p className="text-sm font-medium text-foreground">
            Registered inspector slot
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Product-owned context adapters land here without changing their
            canonical route or granting execution authority.
          </p>
        </div>
        <Button
          icon={<HiOutlineEye className="size-4" />}
          onClick={handleOpenOverlay}
          variant={ButtonVariant.OUTLINE}
          withWrapper={false}
        >
          Open overlay preview
        </Button>
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
    <div
      className="relative min-h-[calc(100dvh-var(--desktop-titlebar-height)-3rem)] overflow-hidden bg-black p-2"
      data-shell-state={state}
      data-testid="universal-workspace-shell"
    >
      <div aria-live="polite" className="sr-only" role="status">
        Workspace state: {state}
      </div>

      <div
        className={cn(
          'h-[calc(100dvh-var(--desktop-titlebar-height)-4rem)] min-h-0 gap-2 xl:grid',
          isInspectorOpen
            ? 'xl:grid-cols-[minmax(0,1fr)_auto]'
            : 'xl:grid-cols-1',
        )}
        data-testid="workspace-shell-regions"
      >
        <div className="h-full min-h-0 min-w-0">
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
              ref={baseState === 'conversation' ? primaryRegionRef : undefined}
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
              'gen-workspace-shell-region-emphasis h-full min-w-0 overflow-auto bg-background shadow-border',
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
            {baseState === 'canvas' ? children : null}
          </section>
        </div>

        {isInspectorOpen ? (
          <aside
            aria-label="Context inspector"
            className="gen-workspace-shell-region relative hidden min-h-0 overflow-hidden bg-background-secondary shadow-border xl:block"
            style={{ width: inspectorWidth }}
          >
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
          </aside>
        ) : (
          <Button
            ariaLabel="Open context inspector"
            className="absolute right-4 top-4 z-10 hidden size-8 xl:inline-flex"
            icon={<HiOutlineViewColumns className="size-4" />}
            onClick={() => setIsInspectorOpen(true)}
            size={ButtonSize.ICON}
            variant={ButtonVariant.OUTLINE}
            withWrapper={false}
          />
        )}
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

      <Dialog
        open={state === 'overlay'}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleDismissOverlay();
          }
        }}
      >
        <DialogContent
          className="w-[min(92vw,42rem)] bg-background p-0 shadow-dialog"
          data-workspace-shell-overlay="true"
          onCloseAutoFocus={(event) => {
            const returnFocusTarget = overlayReturnFocusRef.current;
            if (!returnFocusTarget) {
              return;
            }

            event.preventDefault();
            returnFocusTarget.focus({ preventScroll: true });
            overlayReturnFocusRef.current = null;
          }}
        >
          <DialogHeader className="border-b border-border p-5 pr-12">
            <DialogTitle>Temporary workspace overlay</DialogTitle>
            <DialogDescription>
              This trusted placeholder demonstrates restorable overlay state. It
              does not mutate scope or approve an action.
            </DialogDescription>
          </DialogHeader>
          <div className="p-5 text-sm text-muted-foreground">
            {location.overlayReference
              ? `${location.overlayReference.kind} reference selected`
              : 'No resource reference selected'}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function UniversalWorkspaceShell({
  agentApiService,
  children,
}: UniversalWorkspaceShellProps) {
  return (
    <AgentWorkspaceLayoutClient agentApiService={agentApiService}>
      <UniversalWorkspaceShellContent>
        {children}
      </UniversalWorkspaceShellContent>
    </AgentWorkspaceLayoutClient>
  );
}
