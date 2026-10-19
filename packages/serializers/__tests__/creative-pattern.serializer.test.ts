import { CreativePatternSerializer } from '@serializers/server/analytics/creative-pattern.serializer';
import { describe, expect, it } from 'vitest';

describe('creative pattern serializer', () => {
  it('serializes the pattern fields lifted out of the data column', () => {
    const output = CreativePatternSerializer.serialize({
      avgPerformanceScore: 8.4,
      brandId: 'brand-1',
      computedAt: '2026-10-19T00:00:00.000Z',
      data: { ignored: true },
      description: 'Open on a curiosity gap',
      examples: [{ score: 9, text: 'You will not believe this' }],
      formula: '[Curiosity] + [Payoff]',
      id: 'pattern-1',
      label: 'Curiosity hook',
      organizationId: 'org-1',
      patternType: 'hook_formula',
      platform: 'instagram',
      sampleSize: 42,
      scope: 'public',
      source: 'both',
      validUntil: '2026-11-19T00:00:00.000Z',
    }) as { data: { attributes: Record<string, unknown>; id: string } };

    expect(output.data.id).toBe('pattern-1');
    expect(output.data.attributes).toMatchObject({
      avgPerformanceScore: 8.4,
      brandId: 'brand-1',
      label: 'Curiosity hook',
      patternType: 'hook_formula',
      sampleSize: 42,
      scope: 'public',
      validUntil: '2026-11-19T00:00:00.000Z',
    });
    expect(output.data.attributes).not.toHaveProperty('data');
  });
});
