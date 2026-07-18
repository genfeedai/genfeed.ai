import { describe, expect, it } from 'vitest';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';
import {
  buildWorkspaceShellHref,
  removeWorkspaceShellOverlayParams,
  restoreWorkspaceShellLocation,
} from './workspace-shell-location';

describe('workspace shell URL restoration', () => {
  it('restores canonical conversation and canvas states', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/agent/thread-1',
        pathname: '/acme/~/agent/thread-1',
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({
      baseState: 'conversation',
      state: 'conversation',
      threadId: 'thread-1',
    });

    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/studio/image',
        pathname: '/acme/moonrise/studio/image',
        searchParams: new URLSearchParams({ thread: 'thread-1' }),
      }),
    ).toMatchObject({
      baseState: 'canvas',
      state: 'canvas',
      threadId: 'thread-1',
    });
  });

  it.each([
    '/acme/moonrise/analytics/overview',
    '/acme/moonrise/compose/post',
    '/acme/moonrise/library/moodboard',
    '/acme/moonrise/messages',
    '/acme/moonrise/orchestration/skills',
    '/acme/moonrise/overview/activities',
    '/acme/moonrise/posts/calendar',
    '/acme/moonrise/research/discovery',
    '/acme/moonrise/studio/image',
    '/acme/moonrise/tasks/task-1',
    '/acme/moonrise/workflows/templates',
    '/acme/moonrise/workspace/inbox/all',
    '/acme/~/write',
  ])('registers the protected product family %s as canvas', (pathname) => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: normalizeProtectedPathname(pathname),
        pathname,
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({ baseState: 'canvas', state: 'canvas' });
  });

  it('restores an allowlisted overlay with an authorized canonical reference', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/library/images',
        pathname: '/acme/moonrise/library/images',
        resolveOverlayReferenceAccess: () => 'authorized',
        searchParams: new URLSearchParams({
          overlay: 'shell-preview',
          overlayRef: 'asset:asset-123',
          thread: 'thread-1',
        }),
      }),
    ).toMatchObject({
      baseState: 'canvas',
      overlay: {
        key: 'shell-preview',
        parameters: { reference: { id: 'asset-123', kind: 'asset' } },
      },
      state: 'overlay',
      threadId: 'thread-1',
    });
  });

  it('restores the workflow picker and canonical organization run URL', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/workflows/executions/run-1',
        pathname: '/acme/~/workflows/executions/run-1',
        searchParams: new URLSearchParams({
          overlay: 'workflow-picker',
          thread: 'thread-1',
        }),
      }),
    ).toMatchObject({
      baseState: 'canvas',
      overlay: { key: 'workflow-picker', parameters: {} },
      routeKey: 'route:/:orgSlug/~/workflows/executions/:id',
      state: 'overlay',
      threadId: 'thread-1',
    });
  });

  it('removes invalid overlay state without changing scope or opaque queries', () => {
    const restored = restoreWorkspaceShellLocation({
      normalizedPathname: '/posts/calendar',
      pathname: '/acme/moonrise/posts/calendar',
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
      threadId: 'thread-1',
    });
    expect(restored?.canonicalSearchParams.toString()).toBe(
      'taskId=task-1&thread=thread-1',
    );
  });

  it('fails an invalid typed reference back to the base route', () => {
    const restored = restoreWorkspaceShellLocation({
      normalizedPathname: '/workspace/overview',
      pathname: '/acme/moonrise/workspace/overview',
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
  ])('fails %s reference access back to the exact underlying URL', (resolveOverlayReferenceAccess, restorationFailure) => {
    const restored = restoreWorkspaceShellLocation({
      normalizedPathname: '/library/images',
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
      threadId: 'thread-1',
    });
    expect(restored?.canonicalSearchParams.toString()).toBe(
      'folder=launch&thread=thread-1',
    );
  });

  it('rejects parameters on an overlay registered without parameters', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/agent/thread-1',
        pathname: '/acme/~/agent/thread-1',
        searchParams: new URLSearchParams({
          overlay: 'notifications',
          overlayRef: 'asset:asset-123',
        }),
      }),
    ).toMatchObject({
      overlay: null,
      restorationFailure: 'invalid_overlay_reference',
      state: 'conversation',
    });
  });

  it('restores the no-parameter Library picker over the exact base route', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/posts/remix',
        pathname: '/acme/moonrise/posts/remix',
        searchParams: new URLSearchParams({
          overlay: 'library-picker',
          thread: 'thread-1',
        }),
      }),
    ).toMatchObject({
      baseState: 'canvas',
      overlay: { key: 'library-picker', parameters: {} },
      state: 'overlay',
      threadId: 'thread-1',
    });
  });

  it('marks malformed conversation thread routes for safe canonical fallback', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/agent/undefined',
        pathname: '/acme/~/agent/undefined',
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({
      isCanonical: false,
      restorationFailure: 'invalid_thread',
      safeFallbackHref: '/acme/~/agent',
      state: 'conversation',
      threadId: null,
    });
  });

  it('keeps malformed brand conversation fallbacks inside the same brand', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/agent/undefined',
        pathname: '/acme/moonrise/agent/undefined',
        searchParams: new URLSearchParams(),
      }),
    ).toMatchObject({
      restorationFailure: 'invalid_thread',
      safeFallbackHref: '/acme/moonrise/agent',
    });
  });

  it.each([
    ['/studio/fastlane', '/acme/moonrise/studio/fastlane'],
    ['/agent/journey', '/acme/~/agent/journey'],
    ['/agent/onboarding', '/acme/~/agent/onboarding'],
    ['/settings/billing', '/acme/~/settings/billing'],
  ])('restores the permanent canvas route %s', (normalizedPathname, pathname) => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname,
        pathname,
        searchParams: new URLSearchParams({ thread: 'thread-1' }),
      }),
    ).toMatchObject({
      baseState: 'canvas',
      state: 'canvas',
      threadId: 'thread-1',
    });
  });

  it('returns null for unknown routes', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/unregistered-product',
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
        threadId: 'thread-1',
      }),
    ).toBe(
      '/acme/~/overview?filter=active&thread=thread-1&overlay=shell-preview',
    );

    expect(
      removeWorkspaceShellOverlayParams(
        '/acme/~/overview',
        new URLSearchParams({
          overlay: 'shell-preview',
          taskId: 'task-1',
          thread: 'thread-1',
        }),
      ),
    ).toBe('/acme/~/overview?taskId=task-1&thread=thread-1');
  });
});
