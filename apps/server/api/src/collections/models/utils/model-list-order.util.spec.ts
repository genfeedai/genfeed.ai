import { buildModelListOrderBy } from './model-list-order.util';

describe('buildModelListOrderBy', () => {
  it.each([
    ['provider: 1', { createdAt: -1, id: -1, provider: 1 }],
    ['provider: -1', { createdAt: -1, id: -1, provider: -1 }],
    ['label: 1', { createdAt: -1, id: -1, label: 1 }],
  ])('orders the models table by %j', (sort, expected) => {
    expect(buildModelListOrderBy(sort)).toEqual(expected);
  });

  it('keeps newest first for a column the table cannot sort by', () => {
    expect(buildModelListOrderBy('secret: 1')).toEqual({
      createdAt: -1,
      key: 1,
      label: 1,
    });
  });
});
