'use client';

import { useFeatureFlagContext } from '@hooks/feature-flags/provider';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import { useSyncExternalStore } from 'react';

const WORKSPACE_SHELL_CIRCUIT_BREAKER_KEY =
  'genfeed:conversation-shell:circuit-open';

type WorkspaceShellCircuitReason = 'evaluation' | 'render';

export function isWorkspaceShellCircuitOpen(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return sessionStorage.getItem(WORKSPACE_SHELL_CIRCUIT_BREAKER_KEY) !== null;
  } catch {
    return true;
  }
}

export function openWorkspaceShellCircuit(
  reason: WorkspaceShellCircuitReason,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(WORKSPACE_SHELL_CIRCUIT_BREAKER_KEY, reason);
  } catch {
    // Storage denial is itself a reason to stay on the already-rendered legacy
    // fallback. The error boundary owns that fallback for the current session.
  }
}

export function clearWorkspaceShellEvaluationCircuit(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const reason = sessionStorage.getItem(WORKSPACE_SHELL_CIRCUIT_BREAKER_KEY);
    if (reason === 'evaluation' || reason === '1') {
      sessionStorage.removeItem(WORKSPACE_SHELL_CIRCUIT_BREAKER_KEY);
    }
  } catch {
    // Storage denial remains fail-closed.
  }
}

export function useConversationShellEnabled(): boolean {
  const isFlagEnabled = useFeatureFlag('conversation_shell');
  const isCircuitOpen = useSyncExternalStore(
    () => () => undefined,
    isWorkspaceShellCircuitOpen,
    () => false,
  );

  return isFlagEnabled && !isCircuitOpen;
}

export function useConversationShellEvaluationReady(): boolean {
  return useFeatureFlagContext().isReady;
}
