import { act, renderHook } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsGoogleSignInAvailable } from './use-is-google-sign-in-available';

function AvailabilityProbe() {
  return (
    <span>{useIsGoogleSignInAvailable() ? 'available' : 'unavailable'}</span>
  );
}

afterEach(() => {
  delete globalThis.__GENFEED_RUNTIME_CONFIG__;
});

describe('useIsGoogleSignInAvailable', () => {
  it('keeps Google unavailable before the server reports its capability', () => {
    const { result } = renderHook(() => useIsGoogleSignInAvailable());
    expect(result.current).toBe(false);
  });

  it('re-reads runtime availability on the next client render', () => {
    globalThis.__GENFEED_RUNTIME_CONFIG__ = { isGoogleSignInAvailable: false };
    const { result, rerender } = renderHook(() => useIsGoogleSignInAvailable());
    expect(result.current).toBe(false);
    globalThis.__GENFEED_RUNTIME_CONFIG__ = { isGoogleSignInAvailable: true };
    rerender();
    expect(result.current).toBe(true);
  });

  it.each([true, false])(
    'reads the browser runtime capability %s',
    (isGoogleSignInAvailable) => {
      globalThis.__GENFEED_RUNTIME_CONFIG__ = { isGoogleSignInAvailable };
      const { result } = renderHook(() => useIsGoogleSignInAvailable());
      expect(result.current).toBe(isGoogleSignInAvailable);
    },
  );

  it.each([true, false])(
    'uses a stable unavailable SSR snapshot when runtime capability is %s',
    (isGoogleSignInAvailable) => {
      globalThis.__GENFEED_RUNTIME_CONFIG__ = { isGoogleSignInAvailable };
      expect(renderToString(<AvailabilityProbe />)).toBe(
        '<span>unavailable</span>',
      );
    },
  );

  it.each([true, false])(
    'hydrates to runtime capability %s without a mismatch',
    async (isGoogleSignInAvailable) => {
      const container = document.createElement('div');
      container.innerHTML = renderToString(<AvailabilityProbe />);
      document.body.appendChild(container);
      globalThis.__GENFEED_RUNTIME_CONFIG__ = { isGoogleSignInAvailable };
      const onRecoverableError = vi.fn();
      let root: ReturnType<typeof hydrateRoot> | undefined;

      try {
        await act(async () => {
          root = hydrateRoot(container, <AvailabilityProbe />, {
            onRecoverableError,
          });
        });
        expect(container.textContent).toBe(
          isGoogleSignInAvailable ? 'available' : 'unavailable',
        );
        expect(onRecoverableError).not.toHaveBeenCalled();
      } finally {
        await act(async () => root?.unmount());
        container.remove();
      }
    },
  );
});
