import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseParams = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
}));

import {
  isOpaqueRouteParam,
  sanitizeRouteParams,
  stripOpaqueRouteParam,
  useRouteParams,
} from '@hooks/navigation/use-route-params/use-route-params';

describe('useRouteParams', () => {
  beforeEach(() => {
    mockUseParams.mockReset();
  });

  it('passes resolved params through unchanged', () => {
    mockUseParams.mockReturnValue({ brandSlug: 'my-brand', orgSlug: 'acme' });

    const { result } = renderHook(() => useRouteParams());

    expect(result.current).toEqual({ brandSlug: 'my-brand', orgSlug: 'acme' });
  });

  it('maps opaque fallback strings to undefined', () => {
    mockUseParams.mockReturnValue({
      brandSlug: '%%drp:brandSlug:1a2b3c%%',
      orgSlug: '%%drp:orgSlug:4d5e6f%%',
    });

    const { result } = renderHook(() => useRouteParams());

    expect(result.current.orgSlug).toBeUndefined();
    expect(result.current.brandSlug).toBeUndefined();
  });

  it('keeps resolved params next to unresolved ones', () => {
    mockUseParams.mockReturnValue({
      id: 'abc',
      orgSlug: '%%drp:orgSlug:4d5e6f%%',
    });

    const { result } = renderHook(() => useRouteParams());

    expect(result.current.id).toBe('abc');
    expect(result.current.orgSlug).toBeUndefined();
  });

  it('drops opaque elements from catch-all arrays', () => {
    mockUseParams.mockReturnValue({
      all: ['%%drp:all:1%%'],
      segments: ['library', '%%drp:segments:2%%', 'images'],
    });

    const { result } = renderHook(() => useRouteParams());

    expect(result.current.segments).toEqual(['library', 'images']);
    expect(result.current.all).toBeUndefined();
  });

  it('tolerates a missing params object', () => {
    mockUseParams.mockReturnValue(null);

    const { result } = renderHook(() => useRouteParams());

    expect(result.current).toEqual({});
  });

  it('returns a stable object while the underlying params are stable', () => {
    const params = { id: '%%drp:id:1%%' };
    mockUseParams.mockReturnValue(params);

    const { result, rerender } = renderHook(() => useRouteParams());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});

describe('opaque route param helpers', () => {
  it('detects only the Next fallback prefix', () => {
    expect(isOpaqueRouteParam('%%drp:orgSlug:abc%%')).toBe(true);
    expect(isOpaqueRouteParam('acme')).toBe(false);
    expect(isOpaqueRouteParam('50%%drp:')).toBe(false);
    expect(isOpaqueRouteParam(undefined)).toBe(false);
  });

  it('strips an opaque value and keeps a resolved one', () => {
    expect(stripOpaqueRouteParam('%%drp:brandSlug:x%%')).toBeUndefined();
    expect(stripOpaqueRouteParam('brand')).toBe('brand');
    expect(stripOpaqueRouteParam(undefined)).toBeUndefined();
  });

  it('sanitizes a plain params record', () => {
    expect(
      sanitizeRouteParams({ a: '%%drp:a:1%%', b: 'ok', c: ['%%drp:c:1%%'] }),
    ).toEqual({ a: undefined, b: 'ok', c: undefined });
  });
});
