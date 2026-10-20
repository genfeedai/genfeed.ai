'use client';

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
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import AgentDockThreadMenu from './AgentDockThreadMenu';

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

  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <div className="flex min-w-0 items-center gap-2">
        {title}
        {hasThreadMenu ? (
          <AgentDockThreadMenu
            activeThreadId={activeThreadId}
            isThreadListLoading={isThreadListLoading}
            onNewThread={onNewThread}
            onSelectThread={onSelectThread}
            threadTitle={threadTitle}
            threads={threads}
          />
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
// panel and the sheet swap at the breakpoint): detaching drops browser focus.
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
 * The agent conversation on product routes. At `xl` and up it is a tab of the
 * shell's right-hand side panel (the shell owns the tab strip and the panel
 * chrome); below `xl` it is a bottom sheet. The topbar toggle and ⌘J open it,
 * Esc inside it closes it.
 *
 * The conversation renders once, into a body node owned by the dock, and the
 * panel or the sheet only hosts that node. Closing the sheet, switching to the
 * Details tab, or crossing the breakpoint therefore never remounts the
 * conversation, so uploads, streams and drafts survive.
 */
export default function AgentDock({
  children,
  composerSlotRef,
  dock,
  isCompact,
  isTabActive = true,
  activeThreadId,
  isThreadListLoading = false,
  onNewThread,
  onOpenFullPage,
  onSelectThread,
  scopeControls,
  threadTitle,
  threads,
}: AgentDockProps) {
  const translate = useTranslations('common.agentDock');
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [bodyNode] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const node = document.createElement('div');
    node.className = BODY_CLASS_NAME;
    return node;
  });
  const { close, isOpen } = dock;
  const isPresented = isOpen && (isCompact || isTabActive);
  // The panel and the sheet chrome around the body.
  const isInsideDock = useCallback(
    (element: Element) =>
      Boolean(
        bodyNode?.contains(element) || element.closest('#workspace-agent-dock'),
      ),
    [bodyNode],
  );

  // Opening moves focus into the composer and remembers where it came from;
  // any close (header, Esc, ⌘J, topbar) hands focus back if it was inside.
  useEffect(() => {
    if (!isPresented) {
      const returnFocus = returnFocusRef.current;
      returnFocusRef.current = null;
      const activeElement = document.activeElement;
      const shouldRestore =
        !activeElement ||
        activeElement === document.body ||
        isInsideDock(activeElement);
      if (shouldRestore && isPersistedReturnFocus(returnFocus)) {
        returnFocus.focus({ preventScroll: true });
      }
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
  }, [bodyNode, isInsideDock, isPresented]);

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
              height so the panel's height cannot slice the prompt. */}
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
      <section
        aria-label={translate('label')}
        className="flex min-h-0 flex-1 flex-col"
        data-testid="agent-dock"
        hidden={!isPresented}
        id="workspace-agent-dock"
        onKeyDown={handleKeyDown}
      >
        {bodyNode ? <AgentDockBodyOutlet body={bodyNode} /> : null}
      </section>
    </>
  );
}
