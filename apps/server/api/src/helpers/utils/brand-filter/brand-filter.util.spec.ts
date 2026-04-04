import { BrandFilterUtil } from '@api/helpers/utils/brand-filter/brand-filter.util';

describe('BrandFilterUtil', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('builds logo and banner lookups with unwind stages by default', () => {
    const stages = BrandFilterUtil.buildBrandAssetLookups();
    const logoLookup = stages[0];
    const logoUnwind = stages[1];
    const bannerLookup = stages[2];
    const bannerUnwind = stages[3];

    expect(logoLookup.$lookup.from).toBe('assets');
    expect(logoLookup.$lookup.pipeline[0].$match.$expr.$and).toEqual(
      expect.arrayContaining([
        { $eq: ['$category', 'logo'] },
        { $eq: ['$parentModel', 'Brand'] },
        { $eq: ['$isDeleted', false] },
      ]),
    );
    expect(logoUnwind.$unwind.path).toBe('$logo');
    expect(logoUnwind.$unwind.preserveNullAndEmptyArrays).toBe(true);

    expect(bannerLookup.$lookup.pipeline[0].$match.$expr.$and).toEqual(
      expect.arrayContaining([{ $eq: ['$category', 'banner'] }]),
    );
    expect(bannerUnwind.$unwind.path).toBe('$banner');
  });

  it('includes references and credentials lookups', () => {
    const stages = BrandFilterUtil.buildBrandAssetLookups();
    const referencesLookup = stages.find(
      (stage) =>
        '$lookup' in stage &&
        stage.$lookup?.from === 'assets' &&
        stage.$lookup?.let?.brandId &&
        stage.$lookup.pipeline[0].$match.$expr.$and?.some(
          (expr: Record<string, unknown>) =>
            expr?.$eq &&
            expr.$eq[0] === '$category' &&
            expr.$eq[1] === 'reference',
        ),
    );
    const credentialsLookup = stages.find(
      (stage) => '$lookup' in stage && stage.$lookup?.from === 'credentials',
    );

    expect(referencesLookup).toBeDefined();
    expect(credentialsLookup).toBeDefined();
    expect(credentialsLookup?.$lookup.pipeline[0].$match.$expr.$and).toEqual(
      expect.arrayContaining([
        { $eq: ['$isDeleted', false] },
        { $eq: ['$isConnected', true] },
      ]),
    );
  });

  it('respects include flags to skip certain lookups', () => {
    const stages = BrandFilterUtil.buildBrandAssetLookups({
      includeBanner: false,
      includeCredentials: false,
      includeLogo: false,
      includeReferences: false,
    });

    expect(stages).toHaveLength(0);
  });
});
