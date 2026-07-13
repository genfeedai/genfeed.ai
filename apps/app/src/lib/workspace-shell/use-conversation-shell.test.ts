import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
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

  it('fails the rest of the browser session to the legacy shell', () => {
    openWorkspaceShellCircuit();

    const { result } = renderHook(() => useConversationShellEnabled());

    expect(result.current).toBe(false);
    expect(isWorkspaceShellCircuitOpen()).toBe(true);
  });

  it('never enables the shell when the feature flag is disabled', () => {
    featureFlagState.isEnabled = false;

    const { result } = renderHook(() => useConversationShellEnabled());

    expect(result.current).toBe(false);
  });
});
