import { describe, expect, it } from 'vitest';
import { promptOptimizationSchema } from '../../src/api-types/contracts/prompt-optimization.contract';

const valid = {
  optimizedPrompt: ' P ',
  reasoning: ' R ',
  suggestions: [],
  confidenceScore: 0,
};
describe('prompt-optimization', () => {
  it('accepts domain data and trims required strings', () =>
    expect(promptOptimizationSchema.safeParse(valid).success).toBe(true));
  it('rejects each missing required field', () => {
    const value: Record<string, unknown> = { ...valid };
    const required = Object.keys(value);
    for (const key of required) {
      const incomplete = { ...value };
      delete incomplete[key];
      expect(promptOptimizationSchema.safeParse(incomplete).success).toBe(
        false,
      );
    }
  });
  it('rejects missing fields', () =>
    expect(promptOptimizationSchema.safeParse({}).success).toBe(false));
  it('rejects unknown envelope keys', () =>
    expect(
      promptOptimizationSchema.safeParse({ ...valid, extra: true }).success,
    ).toBe(false));
  it.each([
    { optimizedPrompt: '' },
    { reasoning: ' ' },
    { suggestions: [''] },
    { confidenceScore: -0.01 },
    { confidenceScore: 1.01 },
    { confidenceScore: Infinity },
    { confidenceScore: '1' },
    { extra: 1 },
  ])('rejects invalid field %j', (invalid) =>
    expect(
      promptOptimizationSchema.safeParse({ ...valid, ...invalid }).success,
    ).toBe(false),
  );
  it('accepts inclusive upper confidence', () =>
    expect(
      promptOptimizationSchema.safeParse({ ...valid, confidenceScore: 1 })
        .success,
    ).toBe(true));
});
