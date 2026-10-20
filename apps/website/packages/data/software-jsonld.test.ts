import { describe, expect, it } from 'vitest';

import { buildSoftwareApplicationJsonLd } from './software-jsonld';

describe('buildSoftwareApplicationJsonLd', () => {
  it('describes the open-source licence and repository without fake ratings', () => {
    const jsonLd = buildSoftwareApplicationJsonLd('A description.');

    expect(jsonLd['@type']).toBe('SoftwareApplication');
    expect(jsonLd.description).toBe('A description.');
    expect(jsonLd.license).toContain('agpl-3.0');
    expect(jsonLd.codeRepository).toBe(
      'https://github.com/genfeedai/genfeed.ai',
    );
    expect(jsonLd.offers.price).toBe('0');
    expect(JSON.stringify(jsonLd)).not.toContain('aggregateRating');
  });
});
