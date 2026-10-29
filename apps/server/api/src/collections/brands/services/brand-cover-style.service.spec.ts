import {
  BrandCoverStyleService,
  buildCoverSignature,
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

describe('buildCoverSignature', () => {
  const brand = {
    watermarkInsetXRatio: 0.096,
    watermarkInsetYRatio: 0.235,
    watermarkOpacity: 1,
    watermarkPosition: 'top-right',
    watermarkSizeRatio: 0.067,
    watermarkText: null,
  };

  it('places the mark at the brand ratios', () => {
    expect(buildCoverSignature(brand, 'logos/mark')).toEqual({
      insetXRatio: 0.096,
      insetYRatio: 0.235,
      logoStorageKey: 'logos/mark',
      opacity: 1,
      position: 'top-right',
      sizeRatio: 0.067,
      text: undefined,
    });
  });

  it('gives a brand without its own size a modest one', () => {
    expect(
      buildCoverSignature({ ...brand, watermarkSizeRatio: null }, 'logos/mark')
        ?.sizeRatio,
    ).toBe(0.1);
  });

  it('falls back to the watermark text when there is no logo', () => {
    expect(
      buildCoverSignature(
        { ...brand, watermarkText: ' @shipshitdev ' },
        undefined,
      ),
    ).toMatchObject({ logoStorageKey: undefined, text: '@shipshitdev' });
  });

  it('draws no signature without a mark or text, or with unusable settings', () => {
    expect(buildCoverSignature(brand, undefined)).toBeUndefined();
    expect(
      buildCoverSignature({ ...brand, watermarkOpacity: 0 }, 'logos/mark'),
    ).toBeUndefined();
    expect(
      buildCoverSignature(
        { ...brand, watermarkPosition: 'middle' },
        'logos/mark',
      ),
    ).toBeUndefined();
  });
});

describe('BrandCoverStyleService', () => {
  const brandFindFirst = vi.fn();
  const assetFindFirst = vi.fn();
  const service = new BrandCoverStyleService({
    asset: { findFirst: assetFindFirst },
    brand: { findFirst: brandFindFirst },
  } as never);
  const brandRow = {
    fontFamily: 'INTER_BOLD',
    primaryColor: '#E83B3B',
    watermarkInsetXRatio: 0.096,
    watermarkInsetYRatio: 0.235,
    watermarkLightLogoId: null,
    watermarkLiveLogoId: 'asset-live',
    watermarkLogoId: 'asset-white',
    watermarkOpacity: 1,
    watermarkPosition: 'top-right',
    watermarkSizeRatio: 0.067,
    watermarkText: null,
  };

  beforeEach(() => {
    brandFindFirst.mockReset();
    assetFindFirst.mockReset();
  });

  it('returns nothing without a brand id and does not query', async () => {
    expect(await service.resolveCoverStyle(undefined, 'org-1')).toBeUndefined();
    expect(brandFindFirst).not.toHaveBeenCalled();
  });

  it('scopes the brand lookup to the organization and live brands', async () => {
    brandFindFirst.mockResolvedValue(null);

    await service.resolveCoverStyle('brand-1', 'org-1');

    expect(brandFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });

  it('returns nothing for a brand outside the organization', async () => {
    brandFindFirst.mockResolvedValue(null);

    expect(await service.resolveCoverStyle('brand-9', 'org-1')).toBeUndefined();
  });

  it('gives the brand font, accent and its own default mark', async () => {
    brandFindFirst.mockResolvedValue(brandRow);
    assetFindFirst.mockResolvedValue({
      category: 'LOGO',
      cloudObjectKey: 'logos/white-mark',
      id: 'asset-white',
      mimeType: 'image/png',
    });

    const style = await service.resolveCoverStyle('brand-1', 'org-1');

    expect(assetFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'asset-white',
          isDeleted: false,
          parentBrandId: 'brand-1',
          parentOrgId: 'org-1',
          parentType: 'BRAND',
        },
      }),
    );
    expect(style?.title).toMatchObject({
      accentColor: '#E83B3B',
      fontFamily: 'INTER_BOLD',
    });
    expect(style?.signature).toMatchObject({
      logoStorageKey: 'logos/white-mark',
      position: 'top-right',
      sizeRatio: 0.067,
    });
  });

  it('uses the live mark for the live variant', async () => {
    brandFindFirst.mockResolvedValue(brandRow);
    assetFindFirst.mockResolvedValue({
      category: 'LOGO',
      cloudObjectKey: 'logos/red-mark',
      id: 'asset-live',
      mimeType: 'image/png',
    });

    const style = await service.resolveCoverStyle('brand-1', 'org-1', 'live');

    expect(assetFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'asset-live' }),
      }),
    );
    expect(style?.signature?.logoStorageKey).toBe('logos/red-mark');
  });

  it('draws a cover without a signature when the mark is not an image of the brand', async () => {
    brandFindFirst.mockResolvedValue(brandRow);
    assetFindFirst.mockResolvedValue(null);

    const style = await service.resolveCoverStyle('brand-1', 'org-1');

    expect(style?.signature).toBeUndefined();
    expect(style?.title?.fontFamily).toBe('INTER_BOLD');
  });
});
