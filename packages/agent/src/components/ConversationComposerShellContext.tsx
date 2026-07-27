'use client';

import type {
  ConversationComposerActionInvocation,
  ConversationComposerArtifactReference,
  ConversationComposerContextReference,
  ConversationComposerDispatchResult,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentArtifactReference } from '@genfeedai/interfaces';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';

export interface ConversationComposerShellContextValue {
  artifactReferences?: readonly (
    | AgentArtifactReference
    | ConversationComposerArtifactReference
  )[];
  brandId?: string;
  contextLabel: string;
  dispatchAction?: (
    invocation: ConversationComposerActionInvocation,
  ) =>
    | ConversationComposerDispatchResult
    | Promise<ConversationComposerDispatchResult>;
  draftScopeKey: string | null;
  isConsequentiallyBlocked?: boolean;
  isComposerVisible?: boolean;
  placement?: 'inspector' | 'overlay' | 'surface';
  portalTarget: HTMLElement | null;
  references?: readonly ConversationComposerContextReference[];
  scopeControls?: ReactNode;
  shellState: 'canvas' | 'overlay';
}

interface ConversationComposerShellProviderProps
  extends ConversationComposerShellContextValue {
  children: ReactNode;
}

const ConversationComposerShellContext =
  createContext<ConversationComposerShellContextValue | null>(null);

export function ConversationComposerShellProvider({
  artifactReferences,
  brandId,
  children,
  contextLabel,
  dispatchAction,
  draftScopeKey,
  isConsequentiallyBlocked,
  isComposerVisible,
  placement = 'surface',
  portalTarget,
  references,
  scopeControls,
  shellState,
}: ConversationComposerShellProviderProps): ReactElement {
  const value = useMemo<ConversationComposerShellContextValue>(
    () => ({
      artifactReferences,
      brandId,
      contextLabel,
      dispatchAction,
      draftScopeKey,
      isConsequentiallyBlocked,
      isComposerVisible,
      placement,
      portalTarget,
      references,
      scopeControls,
      shellState,
    }),
    [
      artifactReferences,
      brandId,
      contextLabel,
      dispatchAction,
      draftScopeKey,
      isConsequentiallyBlocked,
      isComposerVisible,
      placement,
      portalTarget,
      references,
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
