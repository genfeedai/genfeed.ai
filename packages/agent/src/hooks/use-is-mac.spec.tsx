import { useIsMac } from '@genfeedai/agent/hooks/use-is-mac';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const originalPlatform = navigator.platform;

function setPlatform(value: string | undefined): void {
  Object.defineProperty(navigator, 'platform', {
    configurable: true,
    value,
  });
}

describe('useIsMac', () => {
  afterEach(() => {
    setPlatform(originalPlatform);
  });

  it('is false when the platform is unavailable', () => {
    setPlatform(undefined);

    const { result } = renderHook(() => useIsMac());

    expect(result.current).toBe(false);
  });

  it('stays stable across rerenders without resubscribing', () => {
    setPlatform('MacIntel');

    const { result, rerender } = renderHook(() => useIsMac());
    rerender();

    expect(result.current).toBe(true);
  });
});
