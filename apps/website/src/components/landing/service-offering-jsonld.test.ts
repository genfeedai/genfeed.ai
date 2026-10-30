import { buildDoneForYouJsonLd } from '@web-components/landing/service-offering-jsonld';
import { describe, expect, it } from 'vitest';

describe('buildDoneForYouJsonLd', () => {
  it('describes the offer as a sentence, not the price-note fragment', () => {
    const { offers } = buildDoneForYouJsonLd();

    expect(offers.description).toMatch(/^[A-Z]/u);
    expect(offers.description).toContain('Usage billed at cost');
  });
});
