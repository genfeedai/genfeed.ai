'use client';

import type {
  AgentDockBodyOutletProps,
  AgentDockProps,
} from '@props/ui/agent-dock.props';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@ui/primitives/drawer';
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
  alternateContent,
  children,
  composerSlotRef,
  header,
  onClose,
  dock,
  isCompact,
  isTabActive = true,
  scopeControls,
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
  const { isOpen } = dock;
  const close = onClose ?? dock.close;
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
          <div className="flex min-h-0 flex-1 flex-col" hidden={!isTabActive}>
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
          </div>
          {isCompact ? (
            <div className="flex min-h-0 flex-1 flex-col" hidden={isTabActive}>
              {alternateContent}
            </div>
          ) : null}
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
            <DrawerTitle className="sr-only">{translate('title')}</DrawerTitle>
            {header}
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
      {/* The Chat view; the named region stays inside it. */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        hidden={!isPresented}
        id="workspace-agent-panel"
      >
        <section
          aria-label={translate('label')}
          className="flex min-h-0 flex-1 flex-col"
          data-testid="agent-dock"
          id="workspace-agent-dock"
          onKeyDown={handleKeyDown}
        >
          {bodyNode ? <AgentDockBodyOutlet body={bodyNode} /> : null}
        </section>
      </div>
    </>
  );
}
