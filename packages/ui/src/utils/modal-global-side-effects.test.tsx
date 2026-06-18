import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupModalGlobalSideEffects,
  hasActiveModalSurface,
  useModalContentGlobalSideEffectCleanup,
} from './modal-global-side-effects';

function resetBodyState(): void {
  document.body.removeAttribute('aria-hidden');
  document.body.removeAttribute('inert');
  document.body.removeAttribute('data-scroll-locked');
  document.body.style.cssText = '';
  document.body.replaceChildren();
}

function CleanupProbe() {
  useModalContentGlobalSideEffectCleanup();
  return null;
}

describe('modal global side effect cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetBodyState();
  });

  it('cleans stale body and app root locks when no modal is active', () => {
    const appRoot = document.createElement('div');
    document.body.appendChild(appRoot);

    document.body.style.pointerEvents = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.paddingRight = '15px';
    document.body.setAttribute('data-scroll-locked', '1');
    appRoot.setAttribute('aria-hidden', 'true');
    appRoot.setAttribute('inert', '');

    cleanupModalGlobalSideEffects();

    expect(document.body.style.pointerEvents).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.touchAction).toBe('');
    expect(document.body.style.paddingRight).toBe('');
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
    expect(appRoot).not.toHaveAttribute('aria-hidden');
    expect(appRoot).not.toHaveAttribute('inert');
  });

  it('keeps global locks while an active dialog is still mounted', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    document.body.appendChild(dialog);
    document.body.style.pointerEvents = 'none';

    expect(hasActiveModalSurface()).toBe(true);

    cleanupModalGlobalSideEffects();

    expect(document.body.style.pointerEvents).toBe('none');
  });

  it('cleans stale locks after abrupt modal content unmount', () => {
    vi.useFakeTimers();
    const { unmount } = render(<CleanupProbe />);

    document.body.style.pointerEvents = 'none';
    document.body.style.overflow = 'hidden';

    unmount();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(document.body.style.pointerEvents).toBe('');
    expect(document.body.style.overflow).toBe('');
  });
});
