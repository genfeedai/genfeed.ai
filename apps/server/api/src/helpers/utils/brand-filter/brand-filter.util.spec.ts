import { BrandFilterUtil } from '@api/helpers/utils/brand-filter/brand-filter.util';

describe('BrandFilterUtil', () => {
  it('includes all brand asset relations by default', () => {
    expect(BrandFilterUtil.buildBrandAssetInclude()).toEqual({
      banner: true,
      credentials: true,
      logo: true,
      references: true,
    });
  });

  it('respects include flags', () => {
    expect(
      BrandFilterUtil.buildBrandAssetInclude({
        includeBanner: false,
        includeCredentials: false,
        includeLogo: true,
        includeReferences: false,
      }),
    ).toEqual({ logo: true });
  });

  it('returns empty include object when all flags are false', () => {
    const include = BrandFilterUtil.buildBrandAssetInclude({
      includeBanner: false,
      includeCredentials: false,
      includeLogo: false,
      includeReferences: false,
    });

    expect(include).toEqual({});
  });
});
