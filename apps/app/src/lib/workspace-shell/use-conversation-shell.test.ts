import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWorkspaceShellEvaluationCircuit,
  isWorkspaceShellCircuitOpen,
  openWorkspaceShellCircuit,
  useConversationShellEnabled,
} from './use-conversation-shell';

const featureFlagState = vi.hoisted(() => ({ isEnabled: true }));

vi.mock('@hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: () => featureFlagState.isEnabled,
}));

describe('conversation shell session circuit breaker', () => {
  beforeEach(() => {
    featureFlagState.isEnabled = true;
    sessionStorage.clear();
  });

  it('keeps the explicitly enabled shell available before a runtime failure', () => {
    const { result } = renderHook(() => useConversationShellEnabled());

    expect(result.current).toBe(true);
    expect(isWorkspaceShellCircuitOpen()).toBe(false);
  });

  it('keeps a render failure on the legacy shell for the browser session', () => {
    openWorkspaceShellCircuit('render');

    const { result } = renderHook(() => useConversationShellEnabled());

    expect(result.current).toBe(false);
    expect(isWorkspaceShellCircuitOpen()).toBe(true);
  });

  it('clears an evaluation failure after the server enables the shell', () => {
    openWorkspaceShellCircuit('evaluation');

    clearWorkspaceShellEvaluationCircuit();

    expect(isWorkspaceShellCircuitOpen()).toBe(false);
  });

  it('clears the legacy circuit value created before reasons were recorded', () => {
    sessionStorage.setItem('genfeed:conversation-shell:circuit-open', '1');

    clearWorkspaceShellEvaluationCircuit();

    expect(isWorkspaceShellCircuitOpen()).toBe(false);
  });

  it('does not clear a render failure after a successful evaluation', () => {
    openWorkspaceShellCircuit('render');

    clearWorkspaceShellEvaluationCircuit();

    expect(isWorkspaceShellCircuitOpen()).toBe(true);
  });

  it('never enables the shell when the feature flag is disabled', () => {
    featureFlagState.isEnabled = false;

    const { result } = renderHook(() => useConversationShellEnabled());

    expect(result.current).toBe(false);
  });
});
