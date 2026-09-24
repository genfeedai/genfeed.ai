import { isCompleteBrandRemixConcept } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { describe, expect, it } from 'vitest';
import {
  brandRemixConceptDirection,
  mergeBrandRemixConcept,
  seedBrandRemixConcept,
} from './brand-remix-concept';
import { remixPatternFromText } from './brand-remix-run-helpers';

const savedAt = '2026-08-20T10:00:00.000Z';

describe('brand remix concept', () => {
  it('seeds an editable concept without copying source text', () => {
    const source =
      'Show the painful old workflow, then reveal the one-click fix.';
    const concept = seedBrandRemixConcept({
      objective: 'Meet Acme and make the next step clear.',
      pattern: remixPatternFromText(source, 'video'),
      savedAt,
    });

    expect(isCompleteBrandRemixConcept(concept)).toBe(true);
    expect(concept.script).toBe('Meet Acme and make the next step clear.');
    expect(concept.storyboard).toEqual([
      expect.objectContaining({ ordinal: 1 }),
    ]);
    expect(JSON.stringify(concept)).not.toContain('painful');
    expect(JSON.stringify(concept)).not.toContain(source);
  });

  it('merges edits and can clear a field without starting from source copy', () => {
    const seeded = seedBrandRemixConcept({
      objective: 'Meet Acme and make the next step clear.',
      pattern: {
        angle: 'Lead with the founder outcome.',
        hook: 'Outcome-led relevance hook.',
        visualDirection: 'Original product close-up.',
      },
      savedAt,
    });
    const merged = mergeBrandRemixConcept(
      seeded,
      {
        angle: null,
        script: 'Put the outcome first, then the next step.',
        storyboard: [
          { ordinal: 1, visualIntent: 'Founder holds the product.' },
          {
            durationSeconds: 4,
            narration: 'Show the next step.',
            ordinal: 2,
            visualIntent: 'Product in use.',
          },
        ],
      },
      '2026-08-20T10:05:00.000Z',
    );

    expect(merged.angle).toBeUndefined();
    expect(merged.hook).toBe('Outcome-led relevance hook.');
    expect(merged.script).toBe('Put the outcome first, then the next step.');
    expect(merged.savedAt).toBe('2026-08-20T10:05:00.000Z');
    expect(merged.storyboard).toHaveLength(2);
    expect(isCompleteBrandRemixConcept(merged)).toBe(false);
  });

  it('keeps concept direction inside the single-output brief limit', () => {
    const direction = brandRemixConceptDirection({
      angle: 'A'.repeat(900),
      hook: 'B'.repeat(900),
      savedAt,
      script: 'Original script.',
      storyboard: [{ ordinal: 1, visualIntent: 'C'.repeat(900) }],
    });

    expect(direction?.length).toBeLessThanOrEqual(1_000);
    expect(direction?.endsWith('...')).toBe(true);
  });
});
