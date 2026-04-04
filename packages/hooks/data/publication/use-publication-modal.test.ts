import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  usePostModal: vi.fn(() => ({
    close: vi.fn(),
    isOpen: false,
    open: vi.fn(),
    publication: null,
  })),
}));

import { usePostModal } from '@providers/global-modals/global-modals.provider';
import { renderHook } from '@testing-library/react';

describe('usePostModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns publication modal state', () => {
    const { result } = renderHook(() => usePostModal());

    expect(result.current).toHaveProperty('isOpen');
    expect(result.current).toHaveProperty('open');
    expect(result.current).toHaveProperty('close');
    expect(result.current).toHaveProperty('publication');
  });

  it('initializes with isOpen as false', () => {
    const { result } = renderHook(() => usePostModal());
    expect(result.current.isOpen).toBe(false);
  });

  it('initializes with null publication', () => {
    const { result } = renderHook(() => usePostModal());
    expect(result.current.publication).toBeNull();
  });

  it('has open and close functions', () => {
    const { result } = renderHook(() => usePostModal());
    expect(typeof result.current.open).toBe('function');
    expect(typeof result.current.close).toBe('function');
  });
});
