'use client';

import {
  AGENT_DOCK_MAX_HEIGHT,
  AGENT_DOCK_MIN_HEIGHT,
} from '@contexts/ui/agent-dock-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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
    <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
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

/** Hosts the dock's one body node, wherever the dock is presented. */
function AgentDockBodyOutlet({ body }: AgentDockBodyOutletProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    host.appendChild(body);
    return () => {
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
  composerSlotRef,
  dock,
  isCompact,
  onOpenFullPage,
  scopeControls,
  threadTitle,
}: AgentDockProps) {
  const translate = useTranslations('common.agentDock');
  const [region, setRegion] = useState<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [bodyNode] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const node = document.createElement('div');
    node.className = BODY_CLASS_NAME;
    return node;
  });
  const [renderedHeight, setRenderedHeight] = useState<number | null>(null);
  const { close, height, isOpen, setHeight } = dock;

  // Opening moves focus into the composer and remembers where it came from;
  // any close (header, Esc, ⌘J, topbar) hands focus back if it was inside.
  useEffect(() => {
    if (!isOpen) {
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      const activeElement = document.activeElement;
      if (
        returnFocus?.isConnected &&
        (!activeElement ||
          activeElement === document.body ||
          bodyNode?.contains(activeElement))
      ) {
        returnFocus.focus({ preventScroll: true });
      }
      return;
    }

    const activeElement = document.activeElement;
    returnFocusRef.current =
      activeElement instanceof HTMLElement && !bodyNode?.contains(activeElement)
        ? activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      focusComposer(bodyNode);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [bodyNode, isOpen]);

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
        <>
          <div
            className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 empty:hidden"
            data-testid="agent-dock-scope"
          >
            {scopeControls}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
          <div
            className="shrink-0 px-3 pb-3 empty:hidden"
            data-testid="agent-dock-composer-slot"
            ref={composerSlotRef}
          />
        </>,
        bodyNode,
      )
    : null;

  if (isCompact) {
    return (
      <>
        {body}
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
      <section
        aria-label={translate('label')}
        className="relative flex shrink-0 flex-col border-t border-border bg-background"
        data-testid="agent-dock"
        hidden={!isOpen}
        id="workspace-agent-dock"
        onKeyDown={handleKeyDown}
        ref={setRegion}
        // Never squeeze the canvas out entirely on short windows.
        style={{ height, maxHeight: 'calc(100% - 8rem)' }}
      >
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
