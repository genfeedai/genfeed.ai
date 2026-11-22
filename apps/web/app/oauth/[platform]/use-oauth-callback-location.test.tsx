import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseOAuthCallbackLocation,
  useOAuthCallbackLocation,
} from './use-oauth-callback-location';

describe('parseOAuthCallbackLocation', () => {
  it.each([
    [
      '/oauth/instagram?code=a&state=b',
      { platform: 'instagram', query: 'code=a&state=b' },
    ],
    ['/oauth/x-ads', { platform: 'x-ads', query: '' }],
    [
      '/oauth/google%20business?code=a',
      { platform: 'google business', query: 'code=a' },
    ],
    ['/oauth/youtube/?code=a', { platform: 'youtube', query: 'code=a' }],
    ['/oauth/%E0%A4%A', { platform: '%E0%A4%A', query: '' }],
  ])('parses %s', (location, expected) => {
    expect(parseOAuthCallbackLocation(location)).toEqual(expected);
  });

  it.each(['/oauth/', '/oauth', '/login?code=a', '/'])(
    'rejects %s',
    (location) => {
      expect(parseOAuthCallbackLocation(location)).toBeNull();
    },
  );
});

describe('useOAuthCallbackLocation', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('returns the platform and query of the current URL', () => {
    window.history.replaceState(null, '', '/oauth/tiktok?code=c1&state=s1');

    const { result } = renderHook(() => useOAuthCallbackLocation());

    expect(result.current?.platform).toBe('tiktok');
    expect(result.current?.searchParams.get('code')).toBe('c1');
    expect(result.current?.searchParams.get('state')).toBe('s1');
  });

  it('keeps the same object across re-renders of the same URL', () => {
    window.history.replaceState(null, '', '/oauth/tiktok?code=c1');

    const { result, rerender } = renderHook(() => useOAuthCallbackLocation());
    const first = result.current;
    act(() => rerender());

    expect(result.current).toBe(first);
  });

  it('returns null outside an oauth route', () => {
    window.history.replaceState(null, '', '/login');

    const { result } = renderHook(() => useOAuthCallbackLocation());

    expect(result.current).toBeNull();
  });
});
