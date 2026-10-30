import {
  BrandCoverStyleService,
  buildCoverTitleStyle,
} from '@api/collections/brands/services/brand-cover-style.service';

describe('buildCoverTitleStyle', () => {
  it('uses the brand font, white type and the primary colour as the accent', () => {
    expect(
      buildCoverTitleStyle({
        fontFamily: 'INTER_BOLD',
        primaryColor: '#e83b3b',
      }),
    ).toEqual({
      accentColor: '#E83B3B',
      color: '#FFFFFF',
      fontFamily: 'INTER_BOLD',
    });
  });

  it('drops an accent that would not read on the dark scrim', () => {
    expect(
      buildCoverTitleStyle({ fontFamily: 'ANTON', primaryColor: '#000000' })
        .accentColor,
    ).toBeUndefined();
    expect(
      buildCoverTitleStyle({ fontFamily: 'ANTON', primaryColor: '#1a1a40' })
        .accentColor,
    ).toBeUndefined();
  });

  it('drops an accent that is not a hex colour', () => {
    expect(
      buildCoverTitleStyle({ fontFamily: null, primaryColor: 'transparent' }),
    ).toEqual({
      accentColor: undefined,
      color: '#FFFFFF',
      fontFamily: undefined,
    });
  });
});

describe('BrandCoverStyleService', () => {
  const findFirst = vi.fn();
  const service = new BrandCoverStyleService({
    brand: { findFirst },
  } as never);

  beforeEach(() => findFirst.mockReset());

  it('returns nothing without a brand id and does not query', async () => {
    expect(await service.resolveTitleStyle(undefined, 'org-1')).toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the organization and live brands', async () => {
    findFirst.mockResolvedValue({
      fontFamily: 'INTER_BOLD',
      primaryColor: '#E83B3B',
    });

    const style = await service.resolveTitleStyle('brand-1', 'org-1');

    expect(findFirst).toHaveBeenCalledWith({
      select: { fontFamily: true, primaryColor: true },
      where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(style?.fontFamily).toBe('INTER_BOLD');
  });

  it('returns nothing for a brand outside the organization', async () => {
    findFirst.mockResolvedValue(null);

    expect(await service.resolveTitleStyle('brand-9', 'org-1')).toBeUndefined();
  });
});
