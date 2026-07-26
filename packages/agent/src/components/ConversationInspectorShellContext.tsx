'use client';

import type { ReactElement, ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

/**
 * Mounted by the workspace shell so the agent conversation can hand its
 * context panels (setup, outputs) to the shell's inspector rail instead of
 * painting a second right-hand column inside the conversation column.
 *
 * `useConversationInspectorShell()` returns `null` when no provider is
 * mounted — that is the "am I inside the shell?" signal, and it keeps the
 * standalone/unit-test rendering of `AgentFullPage` intact.
 */
export interface ConversationInspectorShellContextValue {
  /**
   * The conversation only owns the inspector while it is the active shell
   * surface. Portals must not escape a hidden/inert conversation subtree and
   * replace the active canvas inspector.
   */
  isActive: boolean;
  portalTarget: HTMLElement | null;
  /**
   * Told whether the conversation currently owns the rail, so the shell can
   * stand down its own generic context content instead of stacking an empty
   * state underneath the projected panel.
   */
  setHasPanel: (hasPanel: boolean) => void;
}

interface ConversationInspectorShellProviderProps {
  children: ReactNode;
  isActive: boolean;
  portalTarget: HTMLElement | null;
  onPanelPresenceChange: (hasPanel: boolean) => void;
}

const ConversationInspectorShellContext =
  createContext<ConversationInspectorShellContextValue | null>(null);

export function ConversationInspectorShellProvider({
  children,
  isActive,
  onPanelPresenceChange,
  portalTarget,
}: ConversationInspectorShellProviderProps): ReactElement {
  const value = useMemo<ConversationInspectorShellContextValue>(
    () => ({ isActive, portalTarget, setHasPanel: onPanelPresenceChange }),
    [isActive, onPanelPresenceChange, portalTarget],
  );

  return (
    <ConversationInspectorShellContext.Provider value={value}>
      {children}
    </ConversationInspectorShellContext.Provider>
  );
}

export function useConversationInspectorShell(): ConversationInspectorShellContextValue | null {
  return useContext(ConversationInspectorShellContext);
}
