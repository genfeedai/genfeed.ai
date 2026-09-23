import { describe, expect, it } from 'vitest';
import {
  parseItemReviewBody,
  readItemReviewBody,
} from '../playwright/e2e/utils/expert-path-review';

describe('parseItemReviewBody', () => {
  it.each(['approve', 'edit', 'reject'] as const)(
    'preserves a %s action',
    (action) => {
      expect(parseItemReviewBody({ action })).toEqual({ action });
    },
  );

  it('keeps a non-empty topic edit', () => {
    expect(parseItemReviewBody({ action: 'edit', topic: 'New angle' })).toEqual(
      { action: 'edit', topic: 'New angle' },
    );
  });

  it.each([undefined, '', '   ', 12, null])(
    'omits an absent or invalid topic (%j)',
    (topic) => {
      expect(parseItemReviewBody({ action: 'approve', topic })).toEqual({
        action: 'approve',
      });
    },
  );

  it('rejects a missing action', () => {
    expect(() => parseItemReviewBody({})).toThrow(/approve, edit, or reject/);
  });

  it('rejects a non-string action', () => {
    expect(() => parseItemReviewBody({ action: 1 })).toThrow(
      /approve, edit, or reject/,
    );
  });

  it.each([null, 'approve', ['approve']])(
    'rejects a non-object body (%j)',
    (body) => {
      expect(() => parseItemReviewBody(body)).toThrow(/must be an object/);
    },
  );
});

describe('readItemReviewBody', () => {
  it('rejects invalid JSON from the request reader', () => {
    expect(() =>
      readItemReviewBody(() => {
        throw new SyntaxError('Unexpected token');
      }),
    ).toThrow(/not valid JSON/);
  });
});
