import { describe, expect, it } from 'vitest';
import {
  INITIAL_BRAND_KIT_REVIEW_OPERATIONS as initial,
  brandKitReviewOperationsReducer as reduce,
} from './brand-kit-review-operations';

describe('brandKitReviewOperationsReducer', () => {
  it('clears a failed scan when the scan is retried', () => {
    const failed = reduce(
      reduce(reduce(initial, { operation: 'scan', type: 'start' }), {
        message: 'Failed to scan website for brand kit fields.',
        operation: 'scan',
        type: 'fail',
      }),
      { operation: 'scan', type: 'finish' },
    );
    const retried = reduce(failed, { operation: 'scan', type: 'start' });

    expect(failed).toEqual({
      error: {
        message: 'Failed to scan website for brand kit fields.',
        operation: 'scan',
      },
      pending: new Set(),
    });
    expect(retried).toEqual({ error: null, pending: new Set(['scan']) });
  });

  it('keeps the apply error after the apply settles', () => {
    const settled = reduce(
      reduce(reduce(initial, { operation: 'apply', type: 'start' }), {
        message: 'Failed to apply selected brand kit fields.',
        operation: 'apply',
        type: 'fail',
      }),
      { operation: 'apply', type: 'finish' },
    );

    expect(settled).toEqual({
      error: {
        message: 'Failed to apply selected brand kit fields.',
        operation: 'apply',
      },
      pending: new Set(),
    });
  });

  it('imports assets after an apply finished', () => {
    const applied = reduce(
      reduce(initial, { operation: 'apply', type: 'start' }),
      { operation: 'apply', type: 'finish' },
    );
    const importing = reduce(applied, {
      operation: 'import-assets',
      type: 'start',
    });

    expect(importing).toEqual({
      error: null,
      pending: new Set(['import-assets']),
    });
  });

  it('lets an import run while an apply is still in flight', () => {
    const both = reduce(
      reduce(initial, { operation: 'apply', type: 'start' }),
      { operation: 'import-assets', type: 'start' },
    );

    expect(both.pending).toEqual(new Set(['apply', 'import-assets']));
  });

  it('records an error raised before any step started', () => {
    expect(
      reduce(initial, {
        message: 'Enter a website URL before scanning.',
        operation: 'scan',
        type: 'fail',
      }).error,
    ).toEqual({
      message: 'Enter a website URL before scanning.',
      operation: 'scan',
    });
  });
});
