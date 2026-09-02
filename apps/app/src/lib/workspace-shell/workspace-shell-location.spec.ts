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
    '/acme/moonrise/publishing/calendar',
    '/acme/moonrise/studio/storyboard',
    '/acme/moonrise/workspace/tasks/task-1',
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

  it('restores an allowlisted overlay with an authorized canonical reference', () => {
    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/moonrise/library/images',
        resolveOverlayReferenceAccess: () => 'authorized',
        searchParams: new URLSearchParams({
          overlay: 'shell-preview',
          overlayRef: 'asset:asset-123',
          thread: 'thread-1',
        }),
      }),
    ).toMatchObject({
      overlay: {
        key: 'shell-preview',
        parameters: { reference: { id: 'asset-123', kind: 'asset' } },
      },
      state: 'overlay',
      threadId: null,
    });
  });

  // Workflows are brand-scoped only since the Automation hard-cut — the
  // organization scope no longer registers a workflows surface.
  it('restores the workflow picker and canonical run URL', () => {
    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/moonrise/automation/workflows/executions/run-1',
        searchParams: new URLSearchParams({
          overlay: 'workflow-picker',
          thread: 'thread-1',
        }),
      }),
    ).toMatchObject({
      overlay: { key: 'workflow-picker', parameters: {} },
      routeKey:
        'route:/:orgSlug/:brandSlug/automation/workflows/executions/:id',
      state: 'overlay',
      threadId: null,
    });
  });

  it('removes invalid overlay state without changing scope or opaque queries', () => {
    const restored = restoreWorkspaceShellLocation({
      pathname: '/acme/moonrise/publishing/calendar',
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

  it('fails an invalid typed reference back to the base route', () => {
    const restored = restoreWorkspaceShellLocation({
      pathname: '/acme/moonrise/workspace',
      searchParams: new URLSearchParams({
        overlay: 'shell-preview',
        overlayRef: 'approval:grant-access',
      }),
    });

    expect(restored).toMatchObject({
      restorationFailure: 'invalid_overlay_reference',
      state: 'canvas',
    });
    expect(restored?.canonicalSearchParams.toString()).toBe('');
  });

  it.each([
    [undefined, 'unauthorized_overlay_reference'],
    [() => 'unauthorized' as const, 'unauthorized_overlay_reference'],
    [() => 'stale' as const, 'stale_overlay_reference'],
  ])(
    'fails %s reference access back to the exact underlying URL',
    (resolveOverlayReferenceAccess, restorationFailure) => {
      const restored = restoreWorkspaceShellLocation({
        pathname: '/acme/moonrise/library/images',
        resolveOverlayReferenceAccess,
        searchParams: new URLSearchParams({
          folder: 'launch',
          overlay: 'shell-preview',
          overlayRef: 'asset:asset-123',
          thread: 'thread-1',
        }),
      });

      expect(restored).toMatchObject({
        overlay: null,
        restorationFailure,
        state: 'canvas',
        threadId: null,
      });
      expect(restored?.canonicalSearchParams.toString()).toBe('folder=launch');
    },
  );

  it('rejects parameters on an overlay registered without parameters', () => {
    expect(
      restoreWorkspaceShellLocation({
        pathname: '/acme/~/agent/thread-1',
        searchParams: new URLSearchParams({
          overlay: 'notifications',
          overlayRef: 'asset:asset-123',
        }),
      }),
    ).toMatchObject({
      overlay: null,
      restorationFailure: 'invalid_overlay_reference',
      state: 'canvas',
    });
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
    '/acme/moonrise/studio/fastlane',
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
      buildWorkspaceShellHref('/acme/~/overview?filter=active', {
        overlay: {
          key: 'shell-preview',
          parameters: { reference: null },
        },
      }),
    ).toBe('/acme/~/overview?filter=active&overlay=shell-preview');

    expect(
      removeWorkspaceShellOverlayParams(
        '/acme/~/overview',
        new URLSearchParams({
          overlay: 'shell-preview',
          taskId: 'task-1',
          thread: 'thread-1',
        }),
      ),
    ).toBe('/acme/~/overview?taskId=task-1');
  });
});
