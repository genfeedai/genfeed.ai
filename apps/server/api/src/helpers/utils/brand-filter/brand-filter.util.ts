/**
 * BrandFilterUtil - Utility for building brand-specific query filters
 *
 * Provides reusable filter builders for brand query patterns.
 * Handles brand-specific logic like asset lookups (logo, banner, references, credentials).
 *
 * @example
 * // Build brand asset lookups
 * const assetStages = BrandFilterUtil.buildBrandAssetLookups();
 *
 * // Use in aggregation pipeline
 * const pipeline: Record<string, unknown>[] = [
 *   { $match: { ...baseMatch } },
 *   ...assetStages,
 * ];
 */
export class BrandFilterUtil {
  /**
   * Build brand asset lookup pipeline stages
   *
   * Creates complete lookup stages for brand assets (logo, banner, references, credentials).
   * Returns all necessary $lookup and $unwind stages for brand asset population.
   *
   * @param options - Configuration for which assets to include
   * @returns Array of pipeline stages for brand asset lookups
   *
   * @example
   * // Include all assets
   * BrandFilterUtil.buildBrandAssetLookups()
   * // Returns: [logo lookup + unwind, banner lookup + unwind, references lookup, credentials lookup]
   *
   * @example
   * // Include only logo and banner
   * BrandFilterUtil.buildBrandAssetLookups({
   *   includeLogo: true,
   *   includeBanner: true,
   *   includeReferences: false,
   *   includeCredentials: false,
   * })
   */
  static buildBrandAssetLookups(
    options: {
      includeLogo?: boolean;
      includeBanner?: boolean;
      includeReferences?: boolean;
      includeCredentials?: boolean;
    } = {},
  ): Record<string, unknown>[] {
    const {
      includeLogo = true,
      includeBanner = true,
      includeReferences = true,
      includeCredentials = true,
    } = options;

    const stages: Record<string, unknown>[] = [];

    // Logo lookup (single asset)
    if (includeLogo) {
      stages.push({
        $lookup: {
          as: 'logo',
          from: 'assets',
          let: { brandId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$parent', '$$brandId'] },
                    { $eq: ['$parentModel', 'Brand'] },
                    { $eq: ['$category', 'logo'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
        },
      });
      stages.push({
        $unwind: {
          path: '$logo',
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    // Banner lookup (single asset)
    if (includeBanner) {
      stages.push({
        $lookup: {
          as: 'banner',
          from: 'assets',
          let: { brandId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$parent', '$$brandId'] },
                    { $eq: ['$parentModel', 'Brand'] },
                    { $eq: ['$category', 'banner'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
        },
      });
      stages.push({
        $unwind: {
          path: '$banner',
          preserveNullAndEmptyArrays: true,
        },
      });
    }

    // References lookup (multiple assets)
    if (includeReferences) {
      stages.push({
        $lookup: {
          as: 'references',
          from: 'assets',
          let: { brandId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$parent', '$$brandId'] },
                    { $eq: ['$parentModel', 'Brand'] },
                    { $eq: ['$category', 'reference'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
          ],
        },
      });
    }

    // Credentials lookup
    if (includeCredentials) {
      stages.push({
        $lookup: {
          as: 'credentials',
          from: 'credentials',
          let: { brandId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$brand', '$$brandId'] },
                    { $eq: ['$isDeleted', false] },
                    { $eq: ['$isConnected', true] },
                  ],
                },
              },
            },
          ],
        },
      });
    }

    return stages;
  }
}
