import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceShellHref,
  removeWorkspaceShellOverlayParams,
  restoreWorkspaceShellLocation,
} from './workspace-shell-location';

describe('workspace shell URL restoration', () => {
  it('reads thread identity from the agent path and never from a query param', () => {
    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/~/agent/thread-1',
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({
      isCanonical: true,
      state: 'canvas',
      threadId: 'thread-1',
    });

    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/moonrise/studio/storyboard',
        searchParams: new URLSearchParams({ thread: 'thread-1' }),
      }),
    ).toMatchObject({
      isCanonical: false,
      state: 'canvas',
      threadId: null,
    });
  });

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
    '/acme/moonrise/automation/workflows',
    '/acme/moonrise/workspace/inbox/all',
  ])('registers the protected product family %s as canvas', (pathname) => {
    expect(
      restoreWorkspaceShellLocation({
        pathname,
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({ state: 'canvas' });
  });

  it('strips a stale overlayRef param and still restores the no-parameter overlay', () => {
    const restored = restoreWorkspaceShellLocation({
      pathname: '/acme/moonrise/library/images',
      searchParams: new URLSearchParams({
        overlay: 'library-picker',
        overlayRef: 'asset:asset-123',
        thread: 'thread-1',
      }),
    });

    expect(restored).toMatchObject({
      isCanonical: false,
      overlay: { key: 'library-picker', parameters: {} },
      state: 'overlay',
      threadId: null,
    });
    expect(restored?.canonicalSearchParams.toString()).toBe(
      'overlay=library-picker',
    );
  });

  // Workflows are brand-scoped only since the Automation hard-cut — the
  // organization scope no longer registers a workflows surface.
  it('restores the workflow picker and canonical run URL', () => {
    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/moonrise/automation/runs/run-1',
        searchParams: new URLSearchParams({
          overlay: 'workflow-picker',
          thread: 'thread-1',
        }),
      }),
    ).toMatchObject({
      overlay: { key: 'workflow-picker', parameters: {} },
      routeKey: 'route:/:orgSlug/:brandSlug/automation/runs/:id',
      state: 'overlay',
      threadId: null,
    });
  });

  it('removes invalid overlay state without changing scope or opaque queries', () => {
    const restored = restoreWorkspaceShellLocation({
      pathname: '/acme/moonrise/publishing/review',
      searchParams: new URLSearchParams({
        overlay: 'model-produced-surface',
        taskId: 'task-1',
        thread: 'thread-1',
      }),
    });

    expect(restored).toMatchObject({
      isCanonical: false,
      restorationFailure: 'invalid_overlay',
      state: 'canvas',
      threadId: null,
    });
    expect(restored?.canonicalSearchParams.toString()).toBe('taskId=task-1');
  });

  it('strips a stray overlayRef with no overlay key back to the canonical URL', () => {
    const restored = restoreWorkspaceShellLocation({
      pathname: '/acme/moonrise/workspace',
      searchParams: new URLSearchParams({
        overlayRef: 'asset:asset-123',
      }),
    });

    expect(restored).toMatchObject({
      isCanonical: false,
      overlay: null,
      restorationFailure: null,
      state: 'canvas',
    });
    expect(restored?.canonicalSearchParams.toString()).toBe('');
  });

  it('strips a stale overlayRef alongside a resolved no-parameter overlay', () => {
    const restored = restoreWorkspaceShellLocation({
      pathname: '/acme/~/agent/thread-1',
      searchParams: new URLSearchParams({
        overlay: 'notifications',
        overlayRef: 'asset:asset-123',
      }),
    });

    expect(restored).toMatchObject({
      isCanonical: false,
      overlay: { key: 'notifications', parameters: {} },
      restorationFailure: null,
      state: 'overlay',
    });
    expect(restored?.canonicalSearchParams.toString()).toBe(
      'overlay=notifications',
    );
  });

  it('restores the no-parameter Library picker over the exact base route', () => {
    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/moonrise/publishing/remix',
        searchParams: new URLSearchParams({
          overlay: 'library-picker',
          thread: 'thread-1',
        }),
      }),
    ).toMatchObject({
      overlay: { key: 'library-picker', parameters: {} },
      state: 'overlay',
      threadId: null,
    });
  });

  it('marks malformed conversation thread routes for safe canonical fallback', () => {
    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/~/agent/undefined',
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({
      isCanonical: false,
      restorationFailure: 'invalid_thread',
      safeFallbackHref: '/acme/~/agent',
      state: 'canvas',
      threadId: null,
    });
  });

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

  it('builds registered transitions and direct-link overlay dismissal URLs', () => {
    expect(
      buildWorkspaceShellHref('/acme/~/workspace/overview?filter=active', {
        overlay: {
          key: 'library-picker',
          parameters: {},
        },
      }),
    ).toBe('/acme/~/workspace/overview?filter=active&overlay=library-picker');

    expect(
      removeWorkspaceShellOverlayParams(
        '/acme/~/workspace/overview',
        new URLSearchParams({
          overlay: 'library-picker',
          taskId: 'task-1',
          thread: 'thread-1',
        }),
      ),
    ).toBe('/acme/~/workspace/overview?taskId=task-1');
  });
});
