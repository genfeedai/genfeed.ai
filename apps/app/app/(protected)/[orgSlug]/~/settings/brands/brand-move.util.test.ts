import type { BrandMoveEntry } from '@props/settings/brand-move.props';
import { describe, expect, it } from 'vitest';
import {
  describePreview,
  markOnlyBrandBlocked,
  ONLY_BRAND_REASON,
  summarizeBatch,
} from './brand-move.util';

function entry(id: string, status: BrandMoveEntry['status']): BrandMoveEntry {
  return { brand: { id, label: id } as BrandMoveEntry['brand'], status };
}

describe('markOnlyBrandBlocked', () => {
  it('leaves entries alone when the source org keeps other brands', () => {
    const entries = [entry('a', 'ready'), entry('b', 'ready')];

    expect(markOnlyBrandBlocked(entries, 3)).toEqual(entries);
  });

  it('leaves entries alone when the org brand count is unknown', () => {
    const entries = [entry('a', 'ready'), entry('b', 'ready')];

    expect(markOnlyBrandBlocked(entries, undefined)).toEqual(entries);
  });

  it('blocks the last brand when every brand of the org would move', () => {
    const result = markOnlyBrandBlocked(
      [entry('a', 'ready'), entry('b', 'ready')],
      2,
    );

    expect(result.map((item) => item.status)).toEqual(['ready', 'blocked']);
    expect(result[1].reason).toBe(ONLY_BRAND_REASON);
  });

  it('does not block anything when a blocked brand stays behind', () => {
    const entries = [entry('a', 'ready'), entry('b', 'blocked')];

    expect(markOnlyBrandBlocked(entries, 2)).toEqual(entries);
  });
});

describe('describePreview', () => {
  it('joins moving resources and member loss', () => {
    expect(
      describePreview({
        counts: { soleBrandWorkflows: 0, staleMembers: 2 },
        movingResources: [{ count: 3, label: 'posts', resource: 'post' }],
      }),
    ).toBe('Also moving with it: 3 posts. 2 members will lose access.');
  });

  it('falls back to the workflow count and singular wording', () => {
    expect(
      describePreview({
        counts: { soleBrandWorkflows: 1, staleMembers: 1 },
        movingResources: [],
      }),
    ).toBe('1 dedicated workflow moves with it. 1 member will lose access.');
  });

  it('is empty when nothing else moves', () => {
    expect(
      describePreview({
        counts: { soleBrandWorkflows: 0, staleMembers: 0 },
        movingResources: [],
      }),
    ).toBe('');
  });
});

describe('summarizeBatch', () => {
  it('reports a clean batch', () => {
    expect(summarizeBatch([entry('a', 'moved'), entry('b', 'moved')])).toBe(
      'Moved 2 brands.',
    );
  });

  it('reports a partial batch', () => {
    expect(summarizeBatch([entry('a', 'moved'), entry('b', 'failed')])).toBe(
      "Moved 1 brand; 1 couldn't be moved.",
    );
  });

  it('reports a batch where nothing moved', () => {
    expect(summarizeBatch([entry('a', 'failed')])).toBe(
      "Couldn't move 1 brand.",
    );
  });
});
