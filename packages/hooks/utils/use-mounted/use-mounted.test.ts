import { useMounted } from '@hooks/utils/use-mounted/use-mounted';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

describe('useMounted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mounted state', () => {
    const { result } = renderHook(() => useMounted());
    expect(typeof result.current).toBe('boolean');
  });

  it('is mounted after first render', () => {
    const { result } = renderHook(() => useMounted());
    expect(result.current).toBe(true);
  });
});
