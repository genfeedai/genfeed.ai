import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  captureWorkspaceShellError,
  captureWorkspaceShellPerformance,
  captureWorkspaceShellRestorationFailure,
  captureWorkspaceShellScopeCorrection,
  captureWorkspaceShellSession,
  setWorkspaceShellTelemetryContext,
} from './workspace-shell-telemetry';

const analytics = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  captureAnalyticsEvent: analytics.capture,
}));

describe('workspace shell telemetry privacy contract', () => {
  beforeEach(() => {
    analytics.capture.mockReset();
    setWorkspaceShellTelemetryContext({
      cohort: 'internal',
      configVersion: 'internal-1',
      deploymentMode: 'community',
      rollbackRevision: 2,
    });
  });

  it('adds only bounded rollout context to shell sessions', () => {
    captureWorkspaceShellSession();

    expect(analytics.capture).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CONVERSATION_SHELL_SESSION,
      {
        cohort: 'internal',
        configVersion: 'internal-1',
        deploymentMode: 'community',
        isInternal: true,
        rollbackRevision: 2,
      },
    );
  });

  it('records the global SaaS cohort without treating it as internal', () => {
    setWorkspaceShellTelemetryContext({
      cohort: 'all',
      configVersion: 'global-saas-1',
      deploymentMode: 'saas',
      rollbackRevision: 0,
    });

    captureWorkspaceShellSession();

    expect(analytics.capture).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CONVERSATION_SHELL_SESSION,
      {
        cohort: 'all',
        configVersion: 'global-saas-1',
        deploymentMode: 'saas',
        isInternal: false,
        rollbackRevision: 0,
      },
    );
  });

  it('emits content-free safety, performance, and error properties', () => {
    captureWorkspaceShellRestorationFailure('invalid_overlay_reference');
    captureWorkspaceShellScopeCorrection('failure');
    captureWorkspaceShellPerformance({
      deviceClass: 'mobile',
      durationMs: 420,
      routeClass: 'product',
      shellMode: 'conversation',
    });
    captureWorkspaceShellError('scope', 'scope_sync_failed');

    const serializedCalls = JSON.stringify(analytics.capture.mock.calls);
    expect(serializedCalls).not.toMatch(
      /organizationId|userId|threadId|artifactId|credential|prompt|message|content/i,
    );
    expect(analytics.capture).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CONVERSATION_SHELL_PERFORMANCE,
      expect.objectContaining({
        durationMs: 420,
        metric: 'first_useful_paint',
        routeClass: 'product',
      }),
    );
  });
});
