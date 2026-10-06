'use client';

import {
  AGENT_DOCK_MAX_HEIGHT,
  AGENT_DOCK_MIN_HEIGHT,
} from '@contexts/ui/agent-dock-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  AgentDockBodyOutletProps,
  AgentDockHeaderProps,
  AgentDockProps,
} from '@props/ui/agent-dock.props';
import { Button } from '@ui/primitives/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@ui/primitives/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { Check, ChevronDown, Maximize2, SquarePen, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import AgentConversationBubble from './AgentConversationBubble';

const BUBBLE_CLOSE_MS = 180;
type BubbleMorph = 'closed' | 'from' | 'open';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const RESIZE_STEP = 16;
const RESIZE_STEP_LARGE = 48;
const BODY_CLASS_NAME = 'flex min-h-0 flex-1 flex-col';

function focusComposer(container: HTMLElement | null): void {
  container
    ?.querySelector<HTMLElement>('[contenteditable="true"]')
    ?.focus({ preventScroll: true });
}

function isPersistedReturnFocus(
  element: Element | null,
): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.isConnected &&
    element !== document.body &&
    element !== document.documentElement
  );
}

function resolveLauncherControl(host: HTMLElement | null): HTMLElement | null {
  if (!host?.isConnected) {
    return null;
  }

  return host.querySelector('button') ?? host;
}

function AgentDockHeader({
  activeThreadId,
  isThreadListLoading = false,
  onClose,
  onNewThread,
  onOpenFullPage,
  onSelectThread,
  threadTitle,
  threads = [],
  title,
}: AgentDockHeaderProps) {
  const translate = useTranslations('common.agentDock');
  const hasThreadMenu = Boolean(onNewThread && onSelectThread);
  const selectedThreadLabel =
    threadTitle ||
    threads.find((thread) => thread.id === activeThreadId)?.title ||
    translate('untitledThread');

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <div className="flex min-w-0 items-center gap-2">
        {title}
        {hasThreadMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-6 min-w-0 max-w-[14rem] px-1.5 text-xs font-normal text-muted-foreground"
                data-testid="agent-dock-thread-title"
                size={ButtonSize.SM}
                textTransform="none"
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              >
                <span className="truncate">{selectedThreadLabel}</span>
                <ChevronDown aria-hidden="true" className="size-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-72 w-64 overflow-y-auto"
            >
              <DropdownMenuItem
                data-testid="agent-dock-new-thread"
                onSelect={() => onNewThread?.()}
              >
                <SquarePen aria-hidden="true" className="size-4 shrink-0" />
                {translate('newThread')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isThreadListLoading ? (
                <DropdownMenuLabel>
                  {translate('threadsLoading')}
                </DropdownMenuLabel>
              ) : threads.length === 0 ? (
                <DropdownMenuLabel>{translate('noThreads')}</DropdownMenuLabel>
              ) : (
                threads.map((thread) => {
                  const isCurrent = thread.id === activeThreadId;

                  return (
                    <DropdownMenuItem
                      data-testid={`agent-dock-thread-${thread.id}`}
                      key={thread.id}
                      onSelect={() => onSelectThread?.(thread.id)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {thread.title}
                      </span>
                      {isCurrent ? (
                        <Check
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                      )}
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : threadTitle ? (
          <p
            className="truncate text-xs text-muted-foreground"
            data-testid="agent-dock-thread-title"
          >
            {threadTitle}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          ariaLabel={translate('openFullPage')}
          data-testid="agent-dock-full-page"
          icon={<Maximize2 className="size-4" />}
          onClick={onOpenFullPage}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
        <Button
          ariaLabel={translate('close')}
          data-testid="agent-dock-close"
          icon={<X className="size-4" />}
          onClick={onClose}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </div>
    </div>
  );
}

// The element focused inside a body node while it moves between hosts (the
// section and the sheet swap at the breakpoint): detaching drops browser focus.
const focusedDescendantByBody = new WeakMap<HTMLElement, HTMLElement>();

/** Hosts the dock's one body node, wherever the dock is presented. */
function AgentDockBodyOutlet({ body }: AgentDockBodyOutletProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.appendChild(body);
    const focused = focusedDescendantByBody.get(body);
    focusedDescendantByBody.delete(body);
    if (focused?.isConnected && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
    }

    return () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        body.contains(activeElement)
      ) {
        focusedDescendantByBody.set(body, activeElement);
      }
      if (body.parentNode === host) {
        host.removeChild(body);
      }
    };
  }, [body]);

  return <div className={BODY_CLASS_NAME} ref={hostRef} />;
}

/**
 * The agent conversation on product routes. Closed, it is a chat bubble with
 * the page's shortcuts fanned beside it. The topbar toggle and ⌘J open it,
 * Esc inside it closes it. Below `xl` the open conversation is a bottom sheet.
 *
 * The conversation renders once, into a body node owned by the dock, and the
 * section or the sheet only hosts that node. Closing the sheet or crossing the
 * breakpoint therefore never remounts the conversation, so uploads, streams
 * and drafts survive.
 */
export default function AgentDock({
  children,
  chrome = 'split',
  composerSlotRef,
  dock,
  hasMajorPromptBar = false,
  isCompact,
  activeThreadId,
  isThreadListLoading = false,
  onNewThread,
  onOpenFullPage,
  onSelectSuggestedAction,
  onSelectThread,
  scopeControls,
  suggestedActions,
  threadTitle,
  threads,
}: AgentDockProps) {
  const translate = useTranslations('common.agentDock');
  const [region, setRegion] = useState<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const launcherHostRef = useRef<HTMLElement | null>(null);
  const shouldReturnToLauncherRef = useRef(false);
  const [bodyNode] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const node = document.createElement('div');
    node.className = BODY_CLASS_NAME;
    return node;
  });
  const [renderedHeight, setRenderedHeight] = useState<number | null>(null);
  // The dock's chrome (header, resize handle) and its body, in either
  // presentation.
  const isInsideDock = useCallback(
    (element: Element) =>
      Boolean(
        bodyNode?.contains(element) || element.closest('#workspace-agent-dock'),
      ),
    [bodyNode],
  );
  const { close, height, isOpen, open, setHeight } = dock;
  const isBubbleChrome = chrome === 'bubble';
  const bindLauncher = useCallback((node: HTMLDivElement | null) => {
    launcherHostRef.current = node;
  }, []);
  const handleLauncherOpen = useCallback(() => {
    shouldReturnToLauncherRef.current = true;
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [close, isOpen, open]);
  // Keep the conversation mounted through a short fade/scale from the launcher.
  // Uniform scaling preserves text proportions throughout the transition.
  const [bubbleMorph, setBubbleMorph] = useState<BubbleMorph>(
    isOpen ? 'open' : 'closed',
  );
  useLayoutEffect(() => {
    if (!isBubbleChrome || isCompact) {
      return;
    }
    if (prefersReducedMotion()) {
      setBubbleMorph(isOpen ? 'open' : 'closed');
      return;
    }
    if (isOpen) {
      setBubbleMorph((current) => (current === 'open' ? current : 'from'));
      let nextFrame = 0;
      const frame = window.requestAnimationFrame(() => {
        nextFrame = window.requestAnimationFrame(() => setBubbleMorph('open'));
      });
      return () => {
        window.cancelAnimationFrame(frame);
        window.cancelAnimationFrame(nextFrame);
      };
    }
    setBubbleMorph((current) => (current === 'closed' ? current : 'from'));
  }, [isBubbleChrome, isCompact, isOpen]);
  useEffect(() => {
    if (!isBubbleChrome || isOpen || bubbleMorph !== 'from') {
      return;
    }
    const timeout = window.setTimeout(() => {
      setBubbleMorph('closed');
    }, BUBBLE_CLOSE_MS + 40);
    return () => window.clearTimeout(timeout);
  }, [bubbleMorph, isBubbleChrome, isOpen]);
  const handleBubbleMorphEnd = (event: ReactTransitionEvent<HTMLElement>) => {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== 'transform' ||
      isOpen
    ) {
      return;
    }
    setBubbleMorph('closed');
  };
  // Pages with their own prompt bar do not need a second floating launcher.
  const closedLauncher =
    isBubbleChrome && !hasMajorPromptBar ? (
      <div ref={bindLauncher}>
        <AgentConversationBubble
          isDismissed={isCompact && isOpen}
          isOpen={isOpen}
          onOpen={handleLauncherOpen}
          onSelectSuggestedAction={onSelectSuggestedAction}
          suggestedActions={suggestedActions}
        />
      </div>
    ) : null;

  // Opening moves focus into the composer and remembers where it came from;
  // any close (header, Esc, ⌘J, topbar) hands focus back if it was inside.
  // Restore focus once the closing morph makes the launcher available again.
  useEffect(() => {
    if (!isOpen) {
      if (isBubbleChrome && !isCompact && bubbleMorph !== 'closed') return;
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      const activeElement = document.activeElement;
      const shouldRestore =
        !activeElement ||
        activeElement === document.body ||
        isInsideDock(activeElement);
      const launcher = shouldReturnToLauncherRef.current
        ? resolveLauncherControl(launcherHostRef.current)
        : null;
      shouldReturnToLauncherRef.current = false;
      const target = shouldRestore
        ? (launcher ??
          (isPersistedReturnFocus(returnFocus) ? returnFocus : null))
        : null;
      target?.focus({ preventScroll: true });
      return;
    }

    const activeElement = document.activeElement;
    if (isPersistedReturnFocus(activeElement) && !isInsideDock(activeElement)) {
      returnFocusRef.current = activeElement;
    }
    const frame = window.requestAnimationFrame(() => {
      focusComposer(bodyNode);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [bodyNode, bubbleMorph, isBubbleChrome, isCompact, isInsideDock, isOpen]);

  // Short windows cap the dock below its stored height; resizing works from
  // what is actually on screen.
  useEffect(() => {
    if (!region || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.height > 0) {
        setRenderedHeight(Math.round(entry.contentRect.height));
      }
    });
    observer.observe(region);
    return () => observer.disconnect();
  }, [region]);

  const effectiveHeight =
    renderedHeight !== null ? Math.min(height, renderedHeight) : height;

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      close();
    },
    [close],
  );

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startHeight = effectiveHeight;
      handle.setPointerCapture?.(pointerId);

      const handleMove = (moveEvent: PointerEvent) => {
        setHeight(startHeight + startY - moveEvent.clientY);
      };
      const handleEnd = () => {
        handle.releasePointerCapture?.(pointerId);
        handle.removeEventListener('pointermove', handleMove);
        handle.removeEventListener('pointerup', handleEnd);
        handle.removeEventListener('pointercancel', handleEnd);
      };

      handle.addEventListener('pointermove', handleMove);
      handle.addEventListener('pointerup', handleEnd);
      handle.addEventListener('pointercancel', handleEnd);
    },
    [effectiveHeight, setHeight],
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHeight(effectiveHeight + step);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHeight(effectiveHeight - step);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setHeight(AGENT_DOCK_MAX_HEIGHT);
      } else if (event.key === 'End') {
        event.preventDefault();
        setHeight(AGENT_DOCK_MIN_HEIGHT);
      }
    },
    [effectiveHeight, setHeight],
  );

  const body = bodyNode
    ? createPortal(
        // The body is a React portal: its key events never reach the section's
        // handler, so Escape is handled here too.
        <div className="contents" onKeyDown={handleKeyDown}>
          <div
            className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-1 empty:hidden"
            data-testid="agent-dock-scope"
          >
            {scopeControls}
          </div>
          {/* The transcript shrinks and scrolls. The composer keeps its own
              height so the overlay's max height cannot slice the prompt. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
          <div
            className="flex shrink-0 flex-col px-4 pb-4 pt-2 empty:hidden"
            data-testid="agent-dock-composer-slot"
            ref={composerSlotRef}
          />
        </div>,
        bodyNode,
      )
    : null;

  if (isCompact) {
    return (
      <>
        {body}
        {closedLauncher}
        <Drawer
          open={isOpen}
          onOpenChange={(isDrawerOpen: boolean) => {
            if (isDrawerOpen) {
              dock.open();
            } else {
              close();
            }
          }}
        >
          <DrawerContent
            className="h-[85dvh] rounded-t-[var(--radius-workspace-overlay)]"
            data-chrome={chrome}
            data-testid="agent-dock"
            id="workspace-agent-dock"
          >
            <AgentDockHeader
              activeThreadId={activeThreadId}
              isThreadListLoading={isThreadListLoading}
              onClose={close}
              onNewThread={onNewThread}
              onOpenFullPage={onOpenFullPage}
              onSelectThread={onSelectThread}
              threadTitle={threadTitle}
              threads={threads}
              title={
                <DrawerTitle className="text-sm font-medium">
                  {translate('title')}
                </DrawerTitle>
              }
            />
            <DrawerDescription className="sr-only">
              {translate('description')}
            </DrawerDescription>
            {bodyNode ? <AgentDockBodyOutlet body={bodyNode} /> : null}
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      {body}
      {closedLauncher}
      <section
        aria-label={translate('label')}
        aria-hidden={isBubbleChrome && !isOpen}
        className={cn(
          'flex flex-col bg-background',
          isBubbleChrome
            ? 'absolute right-5 z-30 h-[min(35rem,calc(100dvh-8rem))] w-[min(26rem,calc(100%-2.5rem))] origin-bottom-right overflow-hidden rounded-[var(--radius-workspace-overlay)] border border-border shadow-xl transition-[transform,opacity] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none'
            : 'relative shrink-0 border-t border-border',
          isBubbleChrome &&
            (hasMajorPromptBar
              ? 'bottom-5 max-h-[calc(100%-2.5rem)]'
              : 'bottom-[5.25rem] max-h-[calc(100%-6.5rem)]'),
          isBubbleChrome && (isOpen ? 'duration-[320ms]' : 'duration-[180ms]'),
          isBubbleChrome &&
            (bubbleMorph === 'open' ? 'opacity-100' : 'opacity-0'),
        )}
        data-chrome={chrome}
        data-morph={isBubbleChrome ? bubbleMorph : undefined}
        data-testid="agent-dock"
        hidden={isBubbleChrome ? bubbleMorph === 'closed' : !isOpen}
        id="workspace-agent-dock"
        inert={isBubbleChrome && !isOpen}
        onKeyDown={handleKeyDown}
        onTransitionEnd={isBubbleChrome ? handleBubbleMorphEnd : undefined}
        ref={setRegion}
        // Short windows and half-height panels: the canvas keeps at least
        // 40% of the column, whatever height was stored.
        style={
          isBubbleChrome
            ? {
                transform:
                  bubbleMorph === 'open'
                    ? 'translateY(0) scale(1)'
                    : isOpen
                      ? 'translateY(18px) scale(0.9)'
                      : 'translateY(14px) scale(0.94)',
                transformOrigin: 'bottom right',
              }
            : { height, maxHeight: '60%' }
        }
      >
        {isBubbleChrome ? null : (
          <Button
            aria-orientation="horizontal"
            aria-valuemax={AGENT_DOCK_MAX_HEIGHT}
            aria-valuemin={AGENT_DOCK_MIN_HEIGHT}
            aria-valuenow={effectiveHeight}
            ariaLabel={translate('resize')}
            className="absolute inset-x-0 top-0 z-10 h-1.5 -translate-y-1/2 cursor-row-resize"
            onKeyDown={handleResizeKeyDown}
            onPointerDown={handleResizeStart}
            role="separator"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AgentDockHeader
            activeThreadId={activeThreadId}
            isThreadListLoading={isThreadListLoading}
            onClose={close}
            onNewThread={onNewThread}
            onOpenFullPage={onOpenFullPage}
            onSelectThread={onSelectThread}
            threadTitle={threadTitle}
            threads={threads}
            title={
              <p className="text-sm font-medium text-foreground">
                {translate('title')}
              </p>
            }
          />
          {bodyNode ? <AgentDockBodyOutlet body={bodyNode} /> : null}
        </div>
      </section>
    </>
  );
}
