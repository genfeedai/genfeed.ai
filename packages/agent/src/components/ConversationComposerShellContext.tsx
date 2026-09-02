'use client';

import type {
  ConversationComposerActionInvocation,
  ConversationComposerArtifactReference,
  ConversationComposerContextReference,
  ConversationComposerDispatchResult,
} from '@genfeedai/agent/models/conversation-composer.model';
import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
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
  // scopeControls is often an inline fragment from the shell. Hold it in a
  // ref so identity churn there does not rebuild the whole context value and
  // force every composer consumer to re-render on unrelated shell updates.
  // Sync in layout effect — never mutate refs during render (Strict Mode safe).
  const scopeControlsRef = useRef(scopeControls);
  const dispatchActionRef = useRef(dispatchAction);
  useLayoutEffect(() => {
    scopeControlsRef.current = scopeControls;
    dispatchActionRef.current = dispatchAction;
  });
  const hasDispatchAction = dispatchAction != null;

  const stableDispatchAction = useCallback(
    (
      invocation: ConversationComposerActionInvocation,
    ):
      | ConversationComposerDispatchResult
      | Promise<ConversationComposerDispatchResult> => {
      const latest = dispatchActionRef.current;
      if (!latest) {
        return {
          message: 'Composer actions are unavailable.',
          status: 'unavailable',
        };
      }
      return latest(invocation);
    },
    [],
  );

  const value = useMemo<ConversationComposerShellContextValue>(
    () => ({
      artifactReferences,
      brandId,
      contextLabel,
      dispatchAction: hasDispatchAction ? stableDispatchAction : undefined,
      draftScopeKey,
      isConsequentiallyBlocked,
      isComposerVisible,
      placement,
      portalTarget,
      references,
      get scopeControls() {
        return scopeControlsRef.current;
      },
      shellState,
    }),
    [
      artifactReferences,
      brandId,
      contextLabel,
      hasDispatchAction,
      stableDispatchAction,
      draftScopeKey,
      isConsequentiallyBlocked,
      isComposerVisible,
      placement,
      portalTarget,
      references,
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
