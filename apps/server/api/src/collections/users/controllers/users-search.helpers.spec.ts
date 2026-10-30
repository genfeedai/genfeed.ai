import { buildUserSearchWhere } from '@api/collections/users/controllers/users-search.helpers';
import { describe, expect, it } from 'vitest';

describe('buildUserSearchWhere', () => {
  it.each([undefined, '', '   '])('adds no constraint for %j', (search) => {
    expect(buildUserSearchWhere(search)).toEqual({});
  });

  it('matches email, names and handle case-insensitively on the trimmed term', () => {
    const contains = { contains: 'ada', mode: 'insensitive' };

    expect(buildUserSearchWhere('  ada ')).toEqual({
      OR: [
        { email: contains },
        { firstName: contains },
        { lastName: contains },
        { name: contains },
        { handle: contains },
      ],
    });
  });
});
