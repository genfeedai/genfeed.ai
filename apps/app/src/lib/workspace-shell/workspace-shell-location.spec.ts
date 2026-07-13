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
    '/acme/moonrise/studio/fastlane',
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

  it('restores an allowlisted overlay with an existing-model reference', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/library/images',
        pathname: '/acme/moonrise/library/images',
        searchParams: new URLSearchParams({
          overlay: 'shell-preview',
          overlayRef: 'asset:asset-123',
          thread: 'thread-1',
        }),
      }),
    ).toMatchObject({
      baseState: 'canvas',
      overlayKey: 'shell-preview',
      overlayReference: { id: 'asset-123', kind: 'asset' },
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

  it('returns null for dedicated and unknown routes', () => {
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/agent/journey',
        pathname: '/acme/~/agent/journey',
        searchParams: new URLSearchParams(),
      }),
    ).toBeNull();
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/agent/onboarding',
        pathname: '/acme/~/agent/onboarding',
        searchParams: new URLSearchParams(),
      }),
    ).toBeNull();
    expect(
      restoreWorkspaceShellLocation({
        normalizedPathname: '/settings/billing',
        pathname: '/acme/~/settings/billing',
        searchParams: new URLSearchParams(),
      }),
    ).toBeNull();
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
        overlayKey: 'shell-preview',
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
