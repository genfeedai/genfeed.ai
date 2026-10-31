import { buildSearchWhere } from '@api/helpers/utils/search-where/search-where.util';

describe('buildSearchWhere', () => {
  it.each([undefined, '', '   '])('adds no constraint for %j', (search) => {
    expect(buildSearchWhere(search, { columns: ['label'] })).toEqual({});
  });

  it('matches columns case-insensitively on the trimmed term', () => {
    expect(
      buildSearchWhere('  roboto ', { columns: ['label', 'key'] }),
    ).toEqual({
      AND: [
        {
          OR: [
            { label: { contains: 'roboto', mode: 'insensitive' } },
            { key: { contains: 'roboto', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('matches keys inside a JSON column', () => {
    expect(
      buildSearchWhere('neon', { json: { config: ['label', 'key'] } }),
    ).toEqual({
      AND: [
        {
          OR: [
            {
              config: {
                mode: 'insensitive',
                path: ['label'],
                string_contains: 'neon',
              },
            },
            {
              config: {
                mode: 'insensitive',
                path: ['key'],
                string_contains: 'neon',
              },
            },
          ],
        },
      ],
    });
  });

  it('matches columns of a to-one relation', () => {
    expect(
      buildSearchWhere('org_1', { relations: { referral: ['referrerId'] } }),
    ).toEqual({
      AND: [
        {
          OR: [
            {
              referral: {
                referrerId: { contains: 'org_1', mode: 'insensitive' },
              },
            },
          ],
        },
      ],
    });
  });

  it('adds no constraint when no field is searchable', () => {
    expect(buildSearchWhere('neon', {})).toEqual({});
  });
});
