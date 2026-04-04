import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(public callback: IntersectionObserverCallback) {}
  observe = mockObserve;
  disconnect = mockDisconnect;
  unobserve = vi.fn();
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

describe('useIntersectionObserver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return ref and initial state', () => {
    const { result } = renderHook(() => useIntersectionObserver());

    expect(result.current.ref).toBeDefined();
    expect(result.current.isIntersecting).toBe(false);
    expect(result.current.entry).toBeUndefined();
  });

  it('should accept options', () => {
    const { result } = renderHook(() =>
      useIntersectionObserver({
        rootMargin: '10px',
        threshold: 0.5,
        triggerOnce: true,
      }),
    );

    expect(result.current.ref).toBeDefined();
    expect(result.current.isIntersecting).toBe(false);
  });

  it('should support triggerOnce option', () => {
    const { result } = renderHook(() =>
      useIntersectionObserver({
        triggerOnce: true,
      }),
    );

    expect(result.current.ref).toBeDefined();
  });
});
