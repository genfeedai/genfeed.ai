import { describe, expect, it } from 'vitest';
import { restoreWorkspaceShellLocation } from './workspace-shell-location';

describe('workspace shell URL restoration', () => {
  it.each([
    '/acme/moonrise/analytics',
    '/acme/moonrise/publishing/posts/post-1',
    '/acme/moonrise/library/starred',
    '/acme/moonrise/messages',
    '/acme/~/messages',
    '/acme/~/discovery/overview',
    '/acme/moonrise/settings/skills',
    '/acme/moonrise/overview/activities',
    '/acme/moonrise/studio/storyboard',
    '/acme/moonrise/workspace/tasks/task-1',
    '/acme/moonrise/automation/templates',
    '/acme/moonrise/automation/workflows/templates',
    '/acme/moonrise/workspace/inbox/all',
  ])('registers the protected product family %s as canvas', (pathname) => {
    expect(
      restoreWorkspaceShellLocation({
        pathname,
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({ state: 'canvas' });
  });

  // Workflows are brand-scoped only since the Automation hard-cut — the
  // organization scope no longer registers a workflows surface.

  it('keeps malformed brand conversation fallbacks inside the same brand', () => {
    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/moonrise/agent/undefined',
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({
      restorationFailure: 'invalid_thread',
      safeFallbackHref: '/acme/moonrise/agent',
    });
  });

  it.each([
    '/acme/~/agent/journey',
    '/acme/~/agent/onboarding',
    '/acme/~/settings/subscription',
  ])('restores the permanent canvas route %s', (pathname) => {
    expect(
      restoreWorkspaceShellLocation({
        pathname,
        searchParams: new URLSearchParams({ thread: 'thread-1' }),
      }),
    ).toMatchObject({
      isCanonical: false,
      state: 'canvas',
      threadId: null,
    });
  });

  it('returns null for unknown routes', () => {
    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/moonrise/unregistered-product',
        searchParams: new URLSearchParams(),
      }),
    ).toBeNull();
  });
});
