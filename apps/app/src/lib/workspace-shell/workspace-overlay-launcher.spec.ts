import type { WorkspaceShellOverlayRequest } from '@genfeedai/contracts/interfaces/ui/workspace-shell.interface';
import { describe, expect, it } from 'vitest';
import { resolveWorkspaceOverlayLaunch } from './workspace-overlay-launcher';

const NOTIFICATIONS_OVERLAY = {
  key: 'notifications',
  parameters: {},
} as const satisfies WorkspaceShellOverlayRequest;

const LIBRARY_PICKER_OVERLAY = {
  key: 'library-picker',
  parameters: {},
} as const satisfies WorkspaceShellOverlayRequest;

describe('workspace overlay launcher', () => {
  it('pushes one trusted overlay over the complete underlying URL', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref:
          '/acme/moonrise/library/images?folder=launch&thread=thread-1#asset-grid',
        invocation: 'user',
        overlay: NOTIFICATIONS_OVERLAY,
      }),
    ).toEqual({
      announcement: 'Notifications overlay opened.',
      history: 'push',
      href: '/acme/moonrise/library/images?folder=launch&thread=thread-1&overlay=notifications#asset-grid',
      overlay: NOTIFICATIONS_OVERLAY,
    });
  });

  it('rejects a proposed overlay that carries any parameters', () => {
    const overlay = {
      key: 'notifications',
      parameters: { unexpected: 'value' },
    } as unknown as WorkspaceShellOverlayRequest;

    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/moonrise/library/images?thread=thread-1',
        invocation: 'user',
        overlay,
      }),
    ).toMatchObject({ history: 'none', overlay: null });
  });

  it('never lets a model proposal mutate shell history', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/~/agent/thread-1',
        invocation: 'model',
        overlay: NOTIFICATIONS_OVERLAY,
      }),
    ).toEqual({
      announcement: 'Overlay proposal requires an explicit user action.',
      history: 'none',
      href: '/acme/~/agent/thread-1',
      overlay: null,
    });
  });

  it('fails a forged runtime key without navigating', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/~/agent/thread-1',
        invocation: 'user',
        overlay: {
          key: 'model-produced-surface',
          parameters: {},
        } as unknown as WorkspaceShellOverlayRequest,
      }),
    ).toMatchObject({
      history: 'none',
      href: '/acme/~/agent/thread-1',
      overlay: null,
    });
  });

  it('replaces an existing overlay instead of nesting another history entry', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref:
          '/acme/~/agent/thread-1?overlay=notifications&filter=unread',
        invocation: 'user',
        overlay: LIBRARY_PICKER_OVERLAY,
      }),
    ).toMatchObject({
      history: 'replace',
      href: '/acme/~/agent/thread-1?filter=unread&overlay=library-picker',
    });
  });

  it('does not add history when the exact overlay is already active', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref:
          '/acme/~/agent/thread-1?overlay=notifications&filter=unread',
        invocation: 'user',
        overlay: NOTIFICATIONS_OVERLAY,
      }),
    ).toMatchObject({
      history: 'none',
      href: '/acme/~/agent/thread-1?overlay=notifications&filter=unread',
    });
  });

  it('opens overlays on canvas routes and rejects external locations', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/~/settings/subscription',
        invocation: 'user',
        overlay: NOTIFICATIONS_OVERLAY,
      }),
    ).toMatchObject({
      history: 'push',
      href: '/acme/~/settings/subscription?overlay=notifications',
      overlay: NOTIFICATIONS_OVERLAY,
    });
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: 'https://untrusted.example/workspace',
        invocation: 'user',
        overlay: NOTIFICATIONS_OVERLAY,
      }),
    ).toEqual({
      announcement: 'Overlay unavailable.',
      history: 'none',
      href: '/',
      overlay: null,
    });
  });
});
