import { describe, expect, it } from 'vitest';
import { getJsonApiErrorMessage } from './json-api-error-message';

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
