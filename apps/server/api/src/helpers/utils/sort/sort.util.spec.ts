import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';

describe('handleQuerySort', () => {
  it('returns default sort when query is undefined', () => {
    expect(handleQuerySort(undefined)).toEqual({ createdAt: -1 });
  });

  it('returns default sort when query is empty string', () => {
    expect(handleQuerySort('')).toEqual({ createdAt: -1 });
  });

  it('parses single field sort', () => {
    expect(handleQuerySort('createdAt: -1')).toEqual({ createdAt: -1 });
    expect(handleQuerySort('label: 1')).toEqual({ label: 1 });
  });

  it('parses multi-field sort', () => {
    expect(handleQuerySort('category: 1, label: -1')).toEqual({
      category: 1,
      label: -1,
    });
  });

  it('falls back to default on invalid json', () => {
    expect(handleQuerySort('this-is-not-valid')).toEqual({ createdAt: -1 });
  });
});
