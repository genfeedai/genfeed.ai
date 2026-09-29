import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';

describe('handleQuerySort', () => {
  it('parses single field sort', () => {
    expect(handleQuerySort('createdAt: -1')).toEqual({ createdAt: -1 });
    expect(handleQuerySort('label: 1')).toEqual({ label: 1 });
  });

  it.each([
    'createdAt: 0',
    'created-at: 1',
    'createdAt: 1: -1',
    `field${'0'.repeat(50_000)}`,
  ])('falls back for invalid or adversarial input: %s', (query) => {
    expect(handleQuerySort(query)).toEqual({ createdAt: -1 });
  });
});
