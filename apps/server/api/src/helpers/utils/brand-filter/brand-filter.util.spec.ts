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

    expect(logoLookup.relationInclude.from).toBe('assets');
    expect(logoLookup.relationInclude.pipeline[0].match.$expr.AND).toEqual(
      expect.arrayContaining([
        { $eq: ['$category', 'logo'] },
        { $eq: ['$parentModel', 'Brand'] },
        { $eq: ['$isDeleted', false] },
      ]),
    );
    expect(logoUnwind.relationFlatten.path).toBe('$logo');
    expect(logoUnwind.relationFlatten.preserveNullAndEmptyArrays).toBe(true);

    expect(bannerLookup.relationInclude.pipeline[0].match.$expr.AND).toEqual(
      expect.arrayContaining([{ $eq: ['$category', 'banner'] }]),
    );
    expect(bannerUnwind.relationFlatten.path).toBe('$banner');
  });

  it('includes references and credentials lookups', () => {
    const stages = BrandFilterUtil.buildBrandAssetLookups();
    const referencesLookup = stages.find(
      (stage) =>
        'relationInclude' in stage &&
        stage.relationInclude?.from === 'assets' &&
        stage.relationInclude?.let?.brandId &&
        stage.relationInclude.pipeline[0].match.$expr.AND?.some(
          (expr: Record<string, unknown>) =>
            expr?.$eq &&
            expr.$eq[0] === '$category' &&
            expr.$eq[1] === 'reference',
        ),
    );
    const credentialsLookup = stages.find(
      (stage) =>
        'relationInclude' in stage &&
        stage.relationInclude?.from === 'credentials',
    );

    expect(referencesLookup).toBeDefined();
    expect(credentialsLookup).toBeDefined();
    expect(
      credentialsLookup?.relationInclude.pipeline[0].match.$expr.AND,
    ).toEqual(
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
