import { useAbortController } from '@hooks/utils/use-abort-controller/use-abort-controller';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAbortController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cleans up on unmount', () => {
    const { result, unmount } = renderHook(() => useAbortController());
    const abortSpy = vi.spyOn(result.current, 'abort');
    unmount();
    expect(abortSpy).toHaveBeenCalled();
  });
});
