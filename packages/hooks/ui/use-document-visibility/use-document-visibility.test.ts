import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDocumentVisibility } from './use-document-visibility';

function setDocumentHidden(isHidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => isHidden,
  });
}

describe('useDocumentVisibility', () => {
  afterEach(() => {
    setDocumentHidden(false);
    vi.restoreAllMocks();
  });

  it('starts visible when the document is not hidden', () => {
    setDocumentHidden(false);

    const { result } = renderHook(() => useDocumentVisibility());

    expect(result.current).toBe(true);
  });

  it('starts hidden when the document is hidden', () => {
    setDocumentHidden(true);

    const { result } = renderHook(() => useDocumentVisibility());

    expect(result.current).toBe(false);
  });

  it('tracks visibilitychange events', () => {
    setDocumentHidden(false);

    const { result } = renderHook(() => useDocumentVisibility());
    expect(result.current).toBe(true);

    act(() => {
      setDocumentHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(false);

    act(() => {
      setDocumentHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(true);
  });

  it('removes the listener on unmount', () => {
    const removeListenerSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = renderHook(() => useDocumentVisibility());
    unmount();

    expect(removeListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
  });
});
