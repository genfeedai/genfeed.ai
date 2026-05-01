export class BrandFilterUtil {
  static buildBrandAssetInclude(
    options: {
      includeBanner?: boolean;
      includeCredentials?: boolean;
      includeLogo?: boolean;
      includeReferences?: boolean;
    } = {},
  ): Record<string, boolean> {
    const {
      includeBanner = true,
      includeCredentials = true,
      includeLogo = true,
      includeReferences = true,
    } = options;

    return {
      ...(includeBanner ? { banner: true } : {}),
      ...(includeCredentials ? { credentials: true } : {}),
      ...(includeLogo ? { logo: true } : {}),
      ...(includeReferences ? { references: true } : {}),
    };
  }
}
