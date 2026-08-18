import { describe, expect, it } from 'vitest';
import { BRAND_FIDELITY_HARNESS_PACK } from '../src/brand-fidelity';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
} from '../src/types';

function contribute(input: ContentHarnessInput): ContentHarnessContribution {
  const result = BRAND_FIDELITY_HARNESS_PACK.contribute?.(input);
  if (!result || result instanceof Promise) {
    throw new Error('Expected a synchronous contribution');
  }
  return result;
}

describe('BRAND_FIDELITY_HARNESS_PACK', () => {
  it('names the brand in its evaluation criteria', () => {
    const contribution = contribute({
      brandName: 'Genfeed',
      intent: { contentType: 'post', objective: 'engagement', platform: 'x' },
    });

    expect(BRAND_FIDELITY_HARNESS_PACK.id).toBe('brand-fidelity');
    expect(contribution.evaluationCriteria?.join(' ')).toContain('Genfeed');
    expect(contribution.guardrails?.length).toBeGreaterThan(0);
    expect(contribution.systemDirectives?.length).toBeGreaterThan(0);
  });

  it('falls back to a generic brand label and forwards the audience hint', () => {
    const contribution = contribute({
      intent: {
        audienceHint: 'technical founders',
        contentType: 'post',
        objective: 'engagement',
        platform: 'x',
      },
    });

    expect(contribution.evaluationCriteria?.join(' ')).toContain('the brand');
    expect(contribution.styleDirectives).toEqual([
      'Audience sharpening hint: technical founders.',
    ]);
  });

  it('adds no style directive without an audience hint', () => {
    const contribution = contribute({
      intent: { contentType: 'post', objective: 'engagement', platform: 'x' },
    });

    expect(contribution.styleDirectives).toEqual([]);
  });
});
