import {
  collectBrandIds,
  withBrandNames,
} from '@mcp/services/mcp-brand-names.util';

describe('MCP brand names next to brand ids (#7138)', () => {
  const names = new Map([
    ['brand-1', 'Acme'],
    ['brand-2', 'Beta'],
  ]);

  it('collects the brand ids of a payload and of its lists', () => {
    expect(
      collectBrandIds({
        brandId: 'brand-1',
        posts: [{ brandId: 'brand-2' }, { brandId: 'brand-1' }, { id: 'x' }],
      }),
    ).toEqual(['brand-1', 'brand-2']);
    expect(collectBrandIds({ id: 'x' })).toEqual([]);
    expect(collectBrandIds('text')).toEqual([]);
  });

  it('adds brandName beside brandId and keeps the id', () => {
    expect(
      withBrandNames(
        { brandId: 'brand-1', posts: [{ brandId: 'brand-2', id: 'p' }] },
        names,
      ),
    ).toEqual({
      brandId: 'brand-1',
      brandName: 'Acme',
      posts: [{ brandId: 'brand-2', brandName: 'Beta', id: 'p' }],
    });
  });

  it('leaves unknown brands, existing names and non-records alone', () => {
    const data = { brandId: 'brand-9', brandName: 'Kept' };
    expect(withBrandNames(data, names)).toEqual(data);
    expect(
      withBrandNames({ brandId: 'brand-1', brandName: 'Kept' }, names),
    ).toEqual({ brandId: 'brand-1', brandName: 'Kept' });
    expect(withBrandNames('text', names)).toBe('text');
    expect(withBrandNames({ brandId: 'brand-1' }, new Map())).toEqual({
      brandId: 'brand-1',
    });
  });
});
