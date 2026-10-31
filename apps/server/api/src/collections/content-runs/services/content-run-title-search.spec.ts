import { contentRunTitleSearch } from './content-run-title-search';

describe('contentRunTitleSearch', () => {
  it('matches the title inside config, ignoring case', () => {
    expect(contentRunTitleSearch(['plan', 'title'], ' Spring ')).toEqual({
      AND: [
        {
          config: {
            mode: 'insensitive',
            path: ['plan', 'title'],
            string_contains: 'Spring',
          },
        },
      ],
    });
  });

  it.each([undefined, '', '   '])('adds no constraint for %j', (search) => {
    expect(contentRunTitleSearch(['plan', 'title'], search)).toEqual({});
  });
});
