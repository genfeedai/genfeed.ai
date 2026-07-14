import { describe, expect, it } from 'vitest';
import { resolveWorkspaceSurfaceLaunch } from './workspace-surface-launcher';

describe('workspace surface launcher', () => {
  it('preserves the active thread and destination search params for canvas launches', () => {
    expect(
      resolveWorkspaceSurfaceLaunch({
        currentHref: '/acme/~/agent/thread-1',
        destinationHref:
          '/acme/~/analytics/overview?taskId=task-1&taskSource=workspace',
      }),
    ).toMatchObject({
      announcement: 'Opening analytics in canvas mode.',
      history: 'push',
      href: '/acme/~/analytics/overview?taskId=task-1&taskSource=workspace&thread=thread-1',
      mode: 'canvas',
    });
  });

  it('returns to the canonical active-thread conversation URL', () => {
    expect(
      resolveWorkspaceSurfaceLaunch({
        currentHref:
          '/acme/moonrise/posts/calendar?filter=scheduled&thread=thread-1',
        destinationHref: '/acme/moonrise/agent',
      }),
    ).toMatchObject({
      href: '/acme/moonrise/agent/thread-1',
      mode: 'conversation',
    });
  });

  it('does not carry a thread across organizations', () => {
    expect(
      resolveWorkspaceSurfaceLaunch({
        currentHref: '/acme/~/agent/thread-1',
        destinationHref: '/other/~/overview?thread=attacker-thread',
      }).href,
    ).toBe('/other/~/overview');
  });

  it('uses dedicated navigation for settings and strips shell authority params', () => {
    expect(
      resolveWorkspaceSurfaceLaunch({
        currentHref: '/acme/~/agent/thread-1',
        destinationHref:
          '/acme/~/settings/billing?overlay=shell-preview&thread=thread-1',
      }),
    ).toMatchObject({
      announcement: 'Opening organization settings as a dedicated route.',
      href: '/acme/~/settings/billing',
      mode: 'dedicated',
    });
  });

  it('keeps unknown routes outside shell state without navigating', () => {
    expect(
      resolveWorkspaceSurfaceLaunch({
        currentHref: '/acme/~/agent/thread-1',
        destinationHref:
          '/acme/moonrise/model-surface?overlay=untrusted&thread=thread-1',
      }),
    ).toEqual({
      adapter: null,
      announcement: 'Surface unavailable.',
      history: 'none',
      href: '/acme/~/agent/thread-1',
      mode: 'dedicated',
      registryKey: null,
    });
  });

  it('does not navigate to an untrusted external destination', () => {
    expect(
      resolveWorkspaceSurfaceLaunch({
        currentHref: '/acme/~/agent/thread-1',
        destinationHref: 'https://untrusted.example/canvas',
      }),
    ).toMatchObject({
      history: 'none',
      href: '/acme/~/agent/thread-1',
      registryKey: null,
    });
  });

  it('preserves copied canonical hashes and opaque destination queries', () => {
    expect(
      resolveWorkspaceSurfaceLaunch({
        currentHref: '/acme/moonrise/agent/thread-1',
        destinationHref: '/acme/moonrise/library/images?folder=launch#asset-1',
      }).href,
    ).toBe(
      '/acme/moonrise/library/images?folder=launch&thread=thread-1#asset-1',
    );
  });
});
