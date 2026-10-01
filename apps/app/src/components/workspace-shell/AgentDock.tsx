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
import { Maximize2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import AgentConversationBubble from './AgentConversationBubble';
import AgentPagePromptBar from './AgentPagePromptBar';

const RESIZE_STEP = 16;
const RESIZE_STEP_LARGE = 48;
const BODY_CLASS_NAME = 'flex min-h-0 flex-1 flex-col';

function focusComposer(container: HTMLElement | null): void {
  container
    ?.querySelector<HTMLElement>('[contenteditable="true"]')
    ?.focus({ preventScroll: true });
}

function AgentDockHeader({
  onClose,
  onOpenFullPage,
  threadTitle,
  title,
}: AgentDockHeaderProps) {
  const translate = useTranslations('common.agentDock');

  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
      <div className="flex min-w-0 items-baseline gap-2">
        {title}
        {threadTitle ? (
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
 * The agent conversation docked under the canvas on product routes, like an
 * editor's bottom panel. Collapsed by default; the topbar toggle and ⌘J open
 * it, Esc inside it closes it. Below `xl` the same content is a bottom sheet.
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
  onOpenFullPage,
  onSelectSuggestedAction,
  pagePlaceholder,
  scopeControls,
  suggestedActions,
  threadTitle,
}: AgentDockProps) {
  const translate = useTranslations('common.agentDock');
  const [region, setRegion] = useState<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const launcherNodeRef = useRef<HTMLElement | null>(null);
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
    launcherNodeRef.current = node?.querySelector('button') ?? null;
  }, []);
  const handleLauncherOpen = useCallback(() => {
    shouldReturnToLauncherRef.current = true;
    open();
  }, [open]);
  const closedLauncher =
    isBubbleChrome && !isOpen ? (
      <div ref={bindLauncher}>
        {hasMajorPromptBar ? (
          <AgentConversationBubble onOpen={handleLauncherOpen} />
        ) : (
          <AgentPagePromptBar
            onOpen={handleLauncherOpen}
            onSelectSuggestedAction={onSelectSuggestedAction}
            placeholder={pagePlaceholder}
            suggestedActions={suggestedActions}
          />
        )}
      </div>
    ) : null;

  // Opening moves focus into the composer and remembers where it came from;
  // any close (header, Esc, ⌘J, topbar) hands focus back if it was inside.
  useEffect(() => {
    if (!isOpen) {
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      const activeElement = document.activeElement;
      const shouldRestore =
        !activeElement ||
        activeElement === document.body ||
        isInsideDock(activeElement);
      const target = shouldRestore
        ? returnFocus?.isConnected
          ? returnFocus
          : shouldReturnToLauncherRef.current
            ? launcherNodeRef.current
            : null
        : null;
      shouldReturnToLauncherRef.current = false;
      target?.focus({ preventScroll: true });
      return;
    }

    const activeElement = document.activeElement;
    returnFocusRef.current =
      activeElement instanceof HTMLElement && !isInsideDock(activeElement)
        ? activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      focusComposer(bodyNode);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [bodyNode, isInsideDock, isOpen]);

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
          {/* The transcript always keeps a readable strip. In a short dock the
              composer stack (task panel, prompt) shrinks and scrolls instead
              of pushing the conversation out; column-reverse keeps the prompt
              itself anchored in view and lets the task panel scroll away. */}
          <div className="flex min-h-12 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
          <div
            className="flex min-h-0 shrink flex-col-reverse overflow-y-auto overscroll-contain px-3 pb-2 empty:hidden"
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
            className="h-[85vh] rounded-t-[var(--radius-workspace-overlay)]"
            data-chrome={chrome}
            data-testid="agent-dock"
            id="workspace-agent-dock"
          >
            <AgentDockHeader
              onClose={close}
              onOpenFullPage={onOpenFullPage}
              threadTitle={threadTitle}
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
        className={cn(
          'flex flex-col bg-background',
          isBubbleChrome
            ? 'absolute bottom-4 right-4 z-30 w-[min(28rem,calc(100%-2rem))] max-h-[min(70vh,40rem)] overflow-hidden rounded-[var(--radius-workspace-overlay)] border border-border shadow-xl'
            : 'relative shrink-0 border-t border-border',
        )}
        data-chrome={chrome}
        data-testid="agent-dock"
        hidden={!isOpen}
        id="workspace-agent-dock"
        onKeyDown={handleKeyDown}
        ref={setRegion}
        // Short windows and half-height panels: the canvas keeps at least
        // 40% of the column, whatever height was stored.
        style={isBubbleChrome ? undefined : { height, maxHeight: '60%' }}
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
        <AgentDockHeader
          onClose={close}
          onOpenFullPage={onOpenFullPage}
          threadTitle={threadTitle}
          title={
            <p className="text-sm font-medium text-foreground">
              {translate('title')}
            </p>
          }
        />
        {bodyNode ? <AgentDockBodyOutlet body={bodyNode} /> : null}
      </section>
    </>
  );
}
