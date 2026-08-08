import { matchesMenuSearchParams } from '@helpers/navigation/menu-route-match.helper';
import { describe, expect, it } from 'vitest';

describe('matchesMenuSearchParams', () => {
  it('matches declared navigation filters while ignoring unrelated params', () => {
    const params = new URLSearchParams(
      'publicationState=posted&platform=linkedin&taskId=task-1',
    );

    expect(
      matchesMenuSearchParams(params, { publicationState: 'posted' }),
    ).toBe(true);
  });

  it('supports an explicit absent-parameter contract', () => {
    expect(
      matchesMenuSearchParams(new URLSearchParams('search=launch'), {
        status: null,
      }),
    ).toBe(true);
    expect(
      matchesMenuSearchParams(new URLSearchParams('status=draft'), {
        status: null,
      }),
    ).toBe(false);
  });

  it('rejects a different declared filter value', () => {
    expect(
      matchesMenuSearchParams(
        new URLSearchParams('publicationState=not-posted'),
        { publicationState: 'posted' },
      ),
    ).toBe(false);
  });
});
