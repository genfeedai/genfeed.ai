import { describe, expect, it } from 'vitest';

import { buildComparisonFaqJsonLd } from './comparison-faq-jsonld';
import { competitors } from './competitors.data';

describe('buildComparisonFaqJsonLd', () => {
  it.each(competitors)(
    'builds three answered questions for $slug',
    (competitor) => {
      const jsonLd = buildComparisonFaqJsonLd(competitor);

      expect(jsonLd['@type']).toBe('FAQPage');
      expect(jsonLd.mainEntity).toHaveLength(3);
      for (const entity of jsonLd.mainEntity) {
        expect(entity.name).toContain(competitor.name);
        expect(entity.acceptedAnswer.text.length).toBeGreaterThan(20);
      }
    },
  );
});
