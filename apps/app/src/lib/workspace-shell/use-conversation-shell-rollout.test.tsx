import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationShellRollout } from './use-conversation-shell-rollout';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  captureFallback: vi.fn(),
  captureSession: vi.fn(),
  circuitOpen: false,
  evaluate: vi.fn(),
  getToken: vi.fn(),
  loggerError: vi.fn(),
  openCircuit: vi.fn(),
  setContext: vi.fn(),
}));

vi.mock('@genfeedai/auth-client', () => ({
  isBetterAuthEnabled: () => true,
}));

vi.mock('@genfeedai/config/deployment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config/deployment')>()),
  isDesktopClient: () => false,
  isSelfHostedDeployment: () => false,
}));

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: () => Promise.resolve('token'),
}));

vi.mock('@genfeedai/services/feature-flags/conversation-shell.service', () => ({
  ConversationShellFeatureFlagService: {
    getInstance: () => ({ evaluate: mocks.evaluate }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('@/hooks/useOptionalAuth', () => ({
  useOptionalAuth: () => ({
    getToken: mocks.getToken,
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org-1',
    sessionId: 'session-1',
    userId: 'user-1',
  }),
}));

vi.mock('./workspace-shell-telemetry', () => ({
  captureWorkspaceShellError: mocks.captureError,
  captureWorkspaceShellFallback: mocks.captureFallback,
  captureWorkspaceShellSession: mocks.captureSession,
  setWorkspaceShellTelemetryContext: mocks.setContext,
}));

vi.mock('./use-conversation-shell', () => ({
  isWorkspaceShellCircuitOpen: () => mocks.circuitOpen,
  openWorkspaceShellCircuit: mocks.openCircuit,
}));

const ENABLED_EVALUATION = {
  cohort: 'internal' as const,
  configVersion: 'internal-1',
  deploymentMode: 'saas' as const,
  isEnabled: true,
  evaluatedAt: '2026-07-15T00:00:00.000Z',
  reason: 'enabled' as const,
  rollbackRevision: 0,
  schemaVersion: 1 as const,
};

describe('useConversationShellRollout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.circuitOpen = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts fail closed and enables only after a valid server evaluation', async () => {
    mocks.evaluate.mockResolvedValue(ENABLED_EVALUATION);

    const { result } = renderHook(() => useConversationShellRollout());

    expect(result.current).toEqual({ evaluation: null, isReady: false });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.evaluation?.isEnabled).toBe(true);
    expect(mocks.captureSession).toHaveBeenCalledTimes(1);
  });

  it('opens the legacy circuit when initial evaluation fails', async () => {
    mocks.evaluate.mockRejectedValue(new Error('unavailable'));

    const { result } = renderHook(() => useConversationShellRollout());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.evaluation).toBeNull();
    expect(mocks.openCircuit).toHaveBeenCalledTimes(1);
    expect(mocks.captureFallback).toHaveBeenCalledWith('evaluation_error');
    expect(mocks.captureError).toHaveBeenCalledWith(
      'evaluation',
      'request_failed',
    );
  });

  it('keeps an already failed browser session on the legacy shell', async () => {
    mocks.circuitOpen = true;
    mocks.evaluate.mockResolvedValue(ENABLED_EVALUATION);

    const { result } = renderHook(() => useConversationShellRollout());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.evaluation).toBeNull();
    expect(mocks.captureSession).not.toHaveBeenCalled();
  });

  it('switches an enabled session to legacy on a server rollback poll', async () => {
    vi.useFakeTimers();
    mocks.evaluate
      .mockResolvedValueOnce(ENABLED_EVALUATION)
      .mockResolvedValueOnce({
        ...ENABLED_EVALUATION,
        isEnabled: false,
        reason: 'disabled',
        rollbackRevision: 1,
      });

    const { result } = renderHook(() => useConversationShellRollout());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.evaluation?.isEnabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current.evaluation?.isEnabled).toBe(false);
    expect(mocks.openCircuit).toHaveBeenCalledTimes(1);
    expect(mocks.captureFallback).toHaveBeenCalledWith('server_rollback');
  });
});
