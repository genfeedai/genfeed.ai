import { describe, expect, it } from 'vitest';
import { resolveWorkspaceSurfaceLaunch } from './workspace-surface-launcher';

describe('workspace surface launcher', () => {
  it('returns to the canonical active-thread conversation URL', () => {
    expect(
      resolveWorkspaceSurfaceLaunch({
        currentHref:
          '/acme/moonrise/publishing/posts?view=calendar&thread=thread-1',
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
        destinationHref: '/other/~/workspace/overview?thread=attacker-thread',
      }).href,
    ).toBe('/other/~/workspace/overview');
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
    ).toBe('/acme/moonrise/library/images?folder=launch#asset-1');
  });
});
