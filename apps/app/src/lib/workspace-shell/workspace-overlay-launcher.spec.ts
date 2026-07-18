import type { WorkspaceShellOverlayRequest } from '@genfeedai/interfaces/ui/workspace-shell.interface';
import { describe, expect, it } from 'vitest';
import { resolveWorkspaceOverlayLaunch } from './workspace-overlay-launcher';

const SHELL_PREVIEW_OVERLAY = {
  key: 'shell-preview',
  parameters: { reference: null },
} as const satisfies WorkspaceShellOverlayRequest;

const LIBRARY_PICKER_OVERLAY = {
  key: 'library-picker',
  parameters: {},
} as const satisfies WorkspaceShellOverlayRequest;

describe('workspace overlay launcher', () => {
  it('opens the parameter-free workflow picker through the trusted host', () => {
    const overlay = {
      key: 'workflow-picker',
      parameters: {},
    } as const satisfies WorkspaceShellOverlayRequest;

    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/moonrise/workflows?thread=thread-1',
        invocation: 'user',
        overlay,
      }),
    ).toMatchObject({
      history: 'push',
      href: '/acme/moonrise/workflows?thread=thread-1&overlay=workflow-picker',
      overlay,
    });
  });

  it('pushes one trusted overlay over the complete underlying URL', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref:
          '/acme/moonrise/library/images?folder=launch&thread=thread-1#asset-grid',
        invocation: 'user',
        overlay: SHELL_PREVIEW_OVERLAY,
      }),
    ).toEqual({
      announcement: 'Temporary workspace overlay opened.',
      history: 'push',
      href: '/acme/moonrise/library/images?folder=launch&thread=thread-1&overlay=shell-preview#asset-grid',
      overlay: SHELL_PREVIEW_OVERLAY,
    });
  });

  it('opens the no-parameter Library picker without encoding selection authority', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/~/agent/thread-1',
        invocation: 'user',
        overlay: LIBRARY_PICKER_OVERLAY,
      }),
    ).toEqual({
      announcement: 'Library picker opened.',
      history: 'push',
      href: '/acme/~/agent/thread-1?overlay=library-picker',
      overlay: LIBRARY_PICKER_OVERLAY,
    });
  });

  it('requires explicit authorization for typed reference parameters', () => {
    const overlay = {
      key: 'shell-preview',
      parameters: { reference: { id: 'asset-1', kind: 'asset' } },
    } as const satisfies WorkspaceShellOverlayRequest;

    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/moonrise/library/images?thread=thread-1',
        invocation: 'user',
        overlay,
      }),
    ).toMatchObject({ history: 'none', overlay: null });

    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/moonrise/library/images?thread=thread-1',
        invocation: 'user',
        overlay,
        resolveOverlayReferenceAccess: () => 'authorized',
      }),
    ).toMatchObject({
      history: 'push',
      href: '/acme/moonrise/library/images?thread=thread-1&overlay=shell-preview&overlayRef=asset%3Aasset-1',
      overlay,
    });
  });

  it('never lets a model proposal mutate shell history', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/~/agent/thread-1',
        invocation: 'model',
        overlay: SHELL_PREVIEW_OVERLAY,
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
        overlay: SHELL_PREVIEW_OVERLAY,
      }),
    ).toMatchObject({
      history: 'replace',
      href: '/acme/~/agent/thread-1?filter=unread&overlay=shell-preview',
    });
  });

  it('does not add history when the exact overlay is already active', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref:
          '/acme/~/agent/thread-1?overlay=shell-preview&filter=unread',
        invocation: 'user',
        overlay: SHELL_PREVIEW_OVERLAY,
      }),
    ).toMatchObject({
      history: 'none',
      href: '/acme/~/agent/thread-1?overlay=shell-preview&filter=unread',
    });
  });

  it('opens overlays on canvas routes and rejects external locations', () => {
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: '/acme/~/settings/billing',
        invocation: 'user',
        overlay: SHELL_PREVIEW_OVERLAY,
      }),
    ).toMatchObject({
      history: 'push',
      href: '/acme/~/settings/billing?overlay=shell-preview',
      overlay: SHELL_PREVIEW_OVERLAY,
    });
    expect(
      resolveWorkspaceOverlayLaunch({
        currentHref: 'https://untrusted.example/workspace',
        invocation: 'user',
        overlay: SHELL_PREVIEW_OVERLAY,
      }),
    ).toEqual({
      announcement: 'Overlay unavailable.',
      history: 'none',
      href: '/',
      overlay: null,
    });
  });
});
