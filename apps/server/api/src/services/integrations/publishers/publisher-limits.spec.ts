import {
  DEFAULT_PUBLISHER_LIMIT,
  PUBLISHER_LIMITS,
  resolvePublisherLimit,
  resolvePublishProvider,
} from '@api/services/integrations/publishers/publisher-limits';
import { describe, expect, it } from 'vitest';

describe('publisher limits', () => {
  it('applies the default to a provider with no entry', () => {
    expect(resolvePublisherLimit('twitter')).toEqual(DEFAULT_PUBLISHER_LIMIT);
  });

  it('cites a documentation page for every provider-specific ceiling', () => {
    const uncited = Object.entries(PUBLISHER_LIMITS).filter(
      ([, limit]) => !/^https:\/\//.test(limit.source),
    );

    expect(uncited).toEqual([]);
  });

  it.each([
    ['TWITTER', 'twitter'],
    ['twitter', 'twitter'],
    ['DEV_TO', 'dev_to'],
    ['Some_New_Network', 'some_new_network'],
  ])('keys %s under %s', (platform, provider) => {
    expect(resolvePublishProvider(platform)).toBe(provider);
  });
});
