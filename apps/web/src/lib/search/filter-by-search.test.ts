import { describe, expect, it } from 'vitest';
import { filterBySearch } from './filter-by-search';

const projects = [
  { kind: 'carousel', name: 'Spring launch' },
  { kind: 'video', name: 'Weekly recap' },
  { kind: 'video', name: null },
];

const getFields = (project: { kind: string; name: string | null }) => [
  project.name,
  project.kind,
];

describe('filterBySearch', () => {
  it.each([
    ['spring', ['Spring launch']],
    ['RECAP', ['Weekly recap']],
    ['  carousel  ', ['Spring launch']],
    ['nothing like this', []],
  ])('matches %j', (term, names) => {
    expect(
      filterBySearch(projects, term, getFields).map((project) => project.name),
    ).toEqual(names);
  });

  it('keeps every item for a blank term, including ones with a missing field', () => {
    expect(filterBySearch(projects, '   ', getFields)).toHaveLength(3);
  });
});
