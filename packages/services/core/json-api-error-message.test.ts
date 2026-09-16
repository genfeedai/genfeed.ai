import { describe, expect, it } from 'vitest';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
  getJsonApiErrorMetaBoolean,
  getJsonApiErrorMetaNumber,
} from './json-api-error-message';

describe('getJsonApiErrorMessage', () => {
  it('uses actionable JSON:API detail from plain-object service failures', () => {
    expect(
      getJsonApiErrorMessage(
        {
          errors: [
            {
              detail: 'Reload the remix brief before saving again.',
              title: 'Stale remix revision',
            },
          ],
        },
        'Fallback',
      ),
    ).toBe('Reload the remix brief before saving again.');
  });

  it('exposes the first JSON:API member without private meta', () => {
    expect(
      getJsonApiErrorMember({
        errors: [
          {
            code: '422',
            detail: 'Unsorted shelf is temporarily unavailable',
            meta: { email: 'user@example.com' },
            title: 'Ingredient query failed',
          },
        ],
      }),
    ).toEqual({
      code: '422',
      detail: 'Unsorted shelf is temporarily unavailable',
      status: 422,
      title: 'Ingredient query failed',
    });
  });

  it('falls back through title, Error message, and the supplied default', () => {
    expect(
      getJsonApiErrorMessage(
        { errors: [{ title: 'Source is unauthorized' }] },
        'Fallback',
      ),
    ).toBe('Source is unauthorized');
    expect(
      getJsonApiErrorMessage(new Error('Network failed'), 'Fallback'),
    ).toBe('Network failed');
    expect(getJsonApiErrorMessage({}, 'Fallback')).toBe('Fallback');
  });

  describe('meta primitives', () => {
    const document = {
      errors: [
        {
          code: 'billing_provider_unavailable',
          meta: {
            email: 'user@example.com',
            isRetryable: true,
            maxRetries: 1,
            retryAfterSeconds: 5,
          },
        },
      ],
    };

    it('reads a named number and boolean', () => {
      expect(getJsonApiErrorMetaNumber(document, 'retryAfterSeconds')).toBe(5);
      expect(getJsonApiErrorMetaNumber(document, 'maxRetries')).toBe(1);
      expect(getJsonApiErrorMetaBoolean(document, 'isRetryable')).toBe(true);
    });

    it('never hands back a value of the wrong primitive type', () => {
      // The privacy guarantee of these readers is that only the named
      // primitive can come out; a string in `meta` is not a number.
      expect(getJsonApiErrorMetaNumber(document, 'email')).toBeUndefined();
      expect(getJsonApiErrorMetaBoolean(document, 'email')).toBeUndefined();
      expect(
        getJsonApiErrorMetaNumber(document, 'isRetryable'),
      ).toBeUndefined();
    });

    it.each([
      ['an absent key', { errors: [{ meta: {} }] }],
      ['no meta at all', { errors: [{ code: 'x' }] }],
      ['no errors', {}],
      ['a non-document', new Error('boom')],
      ['null', null],
    ])('returns undefined for %s', (_label, error) => {
      expect(getJsonApiErrorMetaNumber(error, 'maxRetries')).toBeUndefined();
      expect(getJsonApiErrorMetaBoolean(error, 'isRetryable')).toBeUndefined();
    });
  });
});
