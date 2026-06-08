import {
  assertValidIntegrationProviderCatalog,
  getIntegrationProviderDefinition,
  listIntegrationProviderDefinitions,
  providerSupportsCapability,
  validateIntegrationProviderDefinition,
} from './index';

describe('integration provider catalog', () => {
  it('defines at least three current providers', () => {
    const providers = listIntegrationProviderDefinitions();

    expect(providers.length).toBeGreaterThanOrEqual(3);
    expect(providers.map((provider) => provider.key)).toEqual([
      'linkedin',
      'twitter',
      'google_ads',
      'meta_ads',
    ]);
  });

  it('validates every provider definition', () => {
    expect(() => assertValidIntegrationProviderCatalog()).not.toThrow();

    for (const provider of listIntegrationProviderDefinitions()) {
      expect(validateIntegrationProviderDefinition(provider)).toEqual([]);
    }
  });

  it('exposes provider setup metadata and capabilities', () => {
    const linkedIn = getIntegrationProviderDefinition('linkedin');

    expect(linkedIn?.displayName).toBe('LinkedIn');
    expect(linkedIn?.endpoints.apiBaseUrl).toBe('https://api.linkedin.com/v2');
    expect(linkedIn?.credentialFields.some((field) => field.secret)).toBe(true);
    expect(
      linkedIn ? providerSupportsCapability(linkedIn, 'publish_post') : false,
    ).toBe(true);
  });
});
