'use client';

import type {
  AgentDockAttachHandler,
  AgentDockContentReference,
  AgentDockContextValue,
  AgentDockPersistedState,
  AgentDockProviderProps,
} from '@props/ui/agent-dock.props';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export const AGENT_DOCK_STORAGE_KEY = 'genfeed:agent-dock:v1';
export const AGENT_DOCK_DEFAULT_HEIGHT = 320;
export const AGENT_DOCK_MIN_HEIGHT = 200;
export const AGENT_DOCK_MAX_HEIGHT = 640;

const AgentDockContext = createContext<AgentDockContextValue | null>(null);

export function clampAgentDockHeight(height: number): number {
  return Math.min(
    AGENT_DOCK_MAX_HEIGHT,
    Math.max(AGENT_DOCK_MIN_HEIGHT, Math.round(height)),
  );
}

function readAgentDockPersistedState(): AgentDockPersistedState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(AGENT_DOCK_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const { height, isOpen } = parsed as Record<string, unknown>;
    return {
      height:
        typeof height === 'number' && Number.isFinite(height)
          ? clampAgentDockHeight(height)
          : AGENT_DOCK_DEFAULT_HEIGHT,
      isOpen: isOpen === true,
    };
  } catch {
    return null;
  }
}

function persistAgentDockState(state: AgentDockPersistedState): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(AGENT_DOCK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be blocked (private windows); the dock still works per tab.
  }
}

function isAgentDockShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'j'
  );
}

/**
 * The agent's bottom dock on product routes. Sits above the topbar and the
 * workspace shell so the topbar toggle, ⌘J and the shell share one state. The
 * shell reports whether it can host the dock (never on `/agent`) and registers
 * how pages attach records to the dock's composer.
 */
export function AgentDockProvider({ children }: AgentDockProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [height, setHeightState] = useState(AGENT_DOCK_DEFAULT_HEIGHT);
  const [isAvailable, setIsAvailable] = useState(false);
  const [hasRestored, setHasRestored] = useState(false);
  const attachHandlerRef = useRef<AgentDockAttachHandler | null>(null);

  // Restore after mount so the server render and first paint agree.
  useEffect(() => {
    const persisted = readAgentDockPersistedState();
    if (persisted) {
      setIsOpen(persisted.isOpen);
      setHeightState(persisted.height);
    }
    setHasRestored(true);
  }, []);

  useEffect(() => {
    if (hasRestored) {
      persistAgentDockState({ height, isOpen });
    }
  }, [hasRestored, height, isOpen]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((current) => !current), []);
  const setHeight = useCallback((nextHeight: number) => {
    setHeightState(clampAgentDockHeight(nextHeight));
  }, []);

  const registerAttachHandler = useCallback(
    (handler: AgentDockAttachHandler) => {
      attachHandlerRef.current = handler;

      return () => {
        if (attachHandlerRef.current === handler) {
          attachHandlerRef.current = null;
        }
      };
    },
    [],
  );

  const attachContent = useCallback(
    (reference: AgentDockContentReference): boolean => {
      const handler = attachHandlerRef.current;
      if (!handler) {
        return false;
      }

      handler(reference);
      setIsOpen(true);
      return true;
    },
    [],
  );

  useEffect(() => {
    if (!isAvailable) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isAgentDockShortcut(event)) {
        return;
      }

      event.preventDefault();
      setIsOpen((current) => !current);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAvailable]);

  const value = useMemo<AgentDockContextValue>(
    () => ({
      attachContent,
      close,
      height,
      isAvailable,
      isOpen,
      open,
      registerAttachHandler,
      setHeight,
      setIsAvailable,
      toggle,
    }),
    [
      attachContent,
      close,
      height,
      isAvailable,
      isOpen,
      open,
      registerAttachHandler,
      setHeight,
      toggle,
    ],
  );

  return <AgentDockContext value={value}>{children}</AgentDockContext>;
}

/** `null` outside the protected app (unit tests, standalone pages). */
export function useAgentDock(): AgentDockContextValue | null {
  return use(AgentDockContext);
}
