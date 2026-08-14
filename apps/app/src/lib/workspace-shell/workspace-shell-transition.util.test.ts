import {
  resolveOverlayTelemetryUpdate,
  resolveWorkspaceShellTransition,
  shouldRestorePrimaryFocus,
} from './workspace-shell-transition.util';

describe('resolveWorkspaceShellTransition', () => {
  it('prefers an explicit pending transition', () => {
    expect(
      resolveWorkspaceShellTransition({
        normalizedPathname: '/a',
        pendingTransition: 'overlay_open',
        previousPathname: '/b',
        previousState: 'canvas',
        state: 'overlay',
      }),
    ).toBe('overlay_open');
  });

  it('marks the first restore and in-canvas route changes', () => {
    expect(
      resolveWorkspaceShellTransition({
        normalizedPathname: '/a',
        pendingTransition: null,
        previousPathname: null,
        previousState: null,
        state: 'canvas',
      }),
    ).toBe('initial_restore');
    expect(
      resolveWorkspaceShellTransition({
        normalizedPathname: '/b',
        pendingTransition: null,
        previousPathname: '/a',
        previousState: 'canvas',
        state: 'canvas',
      }),
    ).toBe('canvas_change');
    expect(
      resolveWorkspaceShellTransition({
        normalizedPathname: '/a',
        pendingTransition: null,
        previousPathname: '/a',
        previousState: 'canvas',
        state: 'overlay',
      }),
    ).toBe('browser');
  });
});

describe('overlay telemetry and focus helpers', () => {
  it('records overlay class on open and abandons it on dismiss', () => {
    expect(
      resolveOverlayTelemetryUpdate({
        currentTelemetryClass: null,
        isOverlayCompleted: false,
        overlayTelemetryClass: 'shell-preview',
        previousState: 'canvas',
        state: 'overlay',
      }),
    ).toEqual({
      abandonedTelemetryClass: null,
      nextCompleted: false,
      nextTelemetryClass: 'shell-preview',
    });
    expect(
      resolveOverlayTelemetryUpdate({
        currentTelemetryClass: 'shell-preview',
        isOverlayCompleted: false,
        overlayTelemetryClass: null,
        previousState: 'overlay',
        state: 'canvas',
      }).abandonedTelemetryClass,
    ).toBe('shell-preview');
  });

  it('restores canvas focus unless the overlay trigger still owns it', () => {
    expect(
      shouldRestorePrimaryFocus({
        hasOverlayReturnFocus: false,
        previousState: 'overlay',
        state: 'canvas',
      }),
    ).toBe(true);
    expect(
      shouldRestorePrimaryFocus({
        hasOverlayReturnFocus: true,
        previousState: 'overlay',
        state: 'canvas',
      }),
    ).toBe(false);
    expect(
      shouldRestorePrimaryFocus({
        hasOverlayReturnFocus: false,
        previousState: null,
        state: 'canvas',
      }),
    ).toBe(false);
  });
});
