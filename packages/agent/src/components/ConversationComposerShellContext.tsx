'use client';

import type {
  ConversationComposerActionInvocation,
  ConversationComposerDispatchResult,
} from '@genfeedai/agent/models/conversation-composer.model';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';

export interface ConversationComposerShellContextValue {
  contextLabel: string;
  dispatchAction?: (
    invocation: ConversationComposerActionInvocation,
  ) =>
    | ConversationComposerDispatchResult
    | Promise<ConversationComposerDispatchResult>;
  draftScopeKey: string | null;
  isConsequentiallyBlocked?: boolean;
  portalTarget: HTMLElement | null;
  scopeControls?: ReactNode;
  shellState: 'canvas' | 'conversation' | 'overlay';
}

interface ConversationComposerShellProviderProps
  extends ConversationComposerShellContextValue {
  children: ReactNode;
}

const ConversationComposerShellContext =
  createContext<ConversationComposerShellContextValue | null>(null);

export function ConversationComposerShellProvider({
  children,
  contextLabel,
  dispatchAction,
  draftScopeKey,
  isConsequentiallyBlocked,
  portalTarget,
  scopeControls,
  shellState,
}: ConversationComposerShellProviderProps): ReactElement {
  const value = useMemo<ConversationComposerShellContextValue>(
    () => ({
      contextLabel,
      dispatchAction,
      draftScopeKey,
      isConsequentiallyBlocked,
      portalTarget,
      scopeControls,
      shellState,
    }),
    [
      contextLabel,
      dispatchAction,
      draftScopeKey,
      isConsequentiallyBlocked,
      portalTarget,
      scopeControls,
      shellState,
    ],
  );

  return (
    <ConversationComposerShellContext.Provider value={value}>
      {children}
    </ConversationComposerShellContext.Provider>
  );
}

export function useConversationComposerShell(): ConversationComposerShellContextValue | null {
  return useContext(ConversationComposerShellContext);
}
