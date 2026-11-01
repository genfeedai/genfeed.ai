import { describe, expect, it, vi } from 'vitest';
import {
  dispatchNavigationStart,
  navigationChangesLocation,
  subscribeNavigationStart,
  toNavigationType,
} from './navigation-events';

describe('navigationChangesLocation', () => {
  it.each([
    ['/acme/brand/analytics/overview', true],
    ['/acme/brand/library/assets?view=grid', true],
    ['/acme/brand/library/assets', false],
    ['/acme/brand/library/assets#top', false],
    ['https://genfeed.ai/pricing', false],
    ['http://[invalid', false],
  ])('from the library, %s changes the location: %s', (url, expected) => {
    expect(
      navigationChangesLocation(
        url,
        'https://app.genfeed.ai/acme/brand/library/assets',
      ),
    ).toBe(expected);
  });
});

describe('toNavigationType', () => {
  it.each([
    ['push', 'push'],
    ['replace', 'replace'],
    ['traverse', 'traverse'],
    [undefined, 'push'],
  ])('%s maps to %s', (value, expected) => {
    expect(toNavigationType(value)).toBe(expected);
  });
});

describe('navigation start event', () => {
  it('delivers the announced transition to a subscriber until it unsubscribes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNavigationStart(listener);

    dispatchNavigationStart({ navigationType: 'push', url: '/a' });
    unsubscribe();
    dispatchNavigationStart({ navigationType: 'push', url: '/b' });

    expect(listener.mock.calls).toEqual([
      [{ navigationType: 'push', url: '/a' }],
    ]);
  });
});
