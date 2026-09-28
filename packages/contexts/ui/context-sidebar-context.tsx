'use client';

import type {
  ContextSidebarContextValue,
  ContextSidebarOutletProps,
  ContextSidebarPanelProps,
  ContextSidebarProviderProps,
  ContextSidebarRegistration,
  ContextSidebarSelection,
  ContextSidebarSelectionOrigin,
} from '@props/ui/context-sidebar.props';
import {
  createContext,
  type ReactPortal,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

/** Below `xl` the rail is display:none and the sidebar renders as a drawer. */
export const CONTEXT_SIDEBAR_COMPACT_QUERY = '(max-width: 1279px)';

const ContextSidebarContext = createContext<ContextSidebarContextValue | null>(
  null,
);

type ActiveRegistration = {
  readonly registration: ContextSidebarRegistration;
  readonly token: symbol;
};

function selectionKey(
  selection: ContextSidebarSelection | null,
): string | null {
  return selection ? `${selection.kind}:${selection.id}` : null;
}

function isCompactViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(CONTEXT_SIDEBAR_COMPACT_QUERY).matches
  );
}

/**
 * One selection-driven right column for the whole app. Pages register what is
 * selected through `ContextSidebarPanel`; the shell renders the chrome and the
 * outlets the panel portals into. Sits above the topbar and the shell so the
 * topbar toggle and the rail share one state.
 */
export function ContextSidebarProvider({
  children,
}: ContextSidebarProviderProps) {
  const [active, setActive] = useState<ActiveRegistration | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [desktopTarget, setDesktopTarget] = useState<HTMLElement | null>(null);
  const [mobileTarget, setMobileTarget] = useState<HTMLElement | null>(null);
  const activeRef = useRef<ActiveRegistration | null>(null);
  const openedRef = useRef<{
    readonly key: string | null;
    readonly origin: ContextSidebarSelectionOrigin | null;
  }>({ key: null, origin: null });

  useLayoutEffect(() => {
    activeRef.current = active;
  }, [active]);

  const selection = active?.registration.selection ?? null;
  const activeKey = selectionKey(selection);
  const isOpenByDefault = selection?.isOpenByDefault !== false;
  const origin = selection?.origin ?? null;

  const registerSelection = useCallback(
    (registration: ContextSidebarRegistration) => {
      const token = Symbol(selectionKey(registration.selection) ?? 'selection');
      setActive({ registration, token });

      return () => {
        setActive((current) => (current?.token === token ? null : current));
      };
    },
    [],
  );

  // Every new selection opens the sidebar; the same selection re-registering
  // (a title refresh, a new close handler) never fights a collapse. A tap on
  // the item the page had picked automatically is a new user selection.
  useEffect(() => {
    const previous = openedRef.current;
    openedRef.current = { key: activeKey, origin };

    if (!activeKey) {
      if (previous.key) {
        setIsOpen(false);
        setIsMobileOpen(false);
      }
      return;
    }

    const isNewSelection = previous.key !== activeKey;
    const isTapOnAutomaticSelection =
      !isNewSelection && previous.origin === 'automatic' && origin === 'user';
    if (!isNewSelection && !isTapOnAutomaticSelection) {
      return;
    }

    if (isTapOnAutomaticSelection || isOpenByDefault) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
    // Automatic selections never pop the drawer over the page on mobile.
    setIsMobileOpen(
      (current) =>
        isCompactViewport() &&
        (current ||
          (origin === 'user' &&
            (isOpenByDefault || isTapOnAutomaticSelection))),
    );
  }, [activeKey, isOpenByDefault, origin]);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsMobileOpen(false);
    activeRef.current?.registration.onClose();
  }, []);

  const reveal = useCallback(() => {
    if (!activeRef.current) {
      return;
    }
    setIsOpen(true);
    if (isCompactViewport()) {
      setIsMobileOpen(true);
    }
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const portalTarget =
    isMobileOpen && mobileTarget ? mobileTarget : desktopTarget;

  const value = useMemo<ContextSidebarContextValue>(
    () => ({
      close,
      isMobileOpen,
      isOpen,
      portalTarget,
      registerSelection,
      reveal,
      selection,
      setDesktopTarget,
      setIsMobileOpen,
      setMobileTarget,
      toggle,
    }),
    [
      close,
      isMobileOpen,
      isOpen,
      portalTarget,
      registerSelection,
      reveal,
      selection,
      toggle,
    ],
  );

  return (
    <ContextSidebarContext value={value}>{children}</ContextSidebarContext>
  );
}

/** `null` outside the protected app frame (tests, public layouts). */
export function useContextSidebar(): ContextSidebarContextValue | null {
  return use(ContextSidebarContext);
}

/**
 * Registers the page's current selection and renders its detail into the
 * shell's context sidebar. Children stay in the page's React tree (the DOM is
 * portaled), so they keep every provider the page renders under.
 */
export function ContextSidebarPanel({
  children,
  onClose,
  selection,
}: ContextSidebarPanelProps): ReactPortal | null {
  const contextSidebar = use(ContextSidebarContext);
  const registerSelection = contextSidebar?.registerSelection;
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const id = selection?.id;
  const isOpenByDefault = selection?.isOpenByDefault;
  const kind = selection?.kind;
  const origin = selection?.origin;
  const subtitle = selection?.subtitle;
  const title = selection?.title;

  useLayoutEffect(() => {
    if (!registerSelection || !id || !kind || !origin || title === undefined) {
      return;
    }

    return registerSelection({
      onClose: () => onCloseRef.current?.(),
      selection: { id, isOpenByDefault, kind, origin, subtitle, title },
    });
  }, [id, isOpenByDefault, kind, origin, registerSelection, subtitle, title]);

  if (!selection || !contextSidebar?.portalTarget) {
    return null;
  }

  return createPortal(children, contextSidebar.portalTarget);
}

/** The DOM node a selected page's panel is portaled into. */
export function ContextSidebarOutlet({
  className,
  target = 'desktop',
  testId,
}: ContextSidebarOutletProps) {
  const contextSidebar = use(ContextSidebarContext);

  return (
    <div
      className={className}
      data-testid={testId}
      ref={
        target === 'mobile'
          ? contextSidebar?.setMobileTarget
          : contextSidebar?.setDesktopTarget
      }
    />
  );
}
