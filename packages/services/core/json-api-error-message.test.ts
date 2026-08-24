import { describe, expect, it } from 'vitest';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
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
});
