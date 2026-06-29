import {
  assertValidIntegrationProviderCatalog,
  getIntegrationProviderDefinition,
  listIntegrationProviderDefinitions,
  listIntegrationProvidersByCapability,
  providerSupportsCapability,
  resolveIntegrationProviderForCapability,
  validateIntegrationProviderDefinition,
} from './index';

describe('integration provider catalog', () => {
  it('defines at least three current providers', () => {
    const providers = listIntegrationProviderDefinitions();

    expect(providers.length).toBeGreaterThanOrEqual(5);
    expect(providers.map((provider) => provider.key)).toEqual([
      'unipile',
      'linkedin',
      'twitter',
      'google_ads',
      'google_search_console',
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

    const unipile = getIntegrationProviderDefinition('unipile');
    expect(unipile?.authMode).toBe('api_key');
    expect(unipile?.credentialFields.some((field) => field.secret)).toBe(true);
    expect(
      unipile ? providerSupportsCapability(unipile, 'send_email') : false,
    ).toBe(true);
  });

  it('routes providers by capability with optional preference', () => {
    expect(
      listIntegrationProvidersByCapability('send_email').map(
        (provider) => provider.key,
      ),
    ).toEqual(['unipile']);

    expect(
      resolveIntegrationProviderForCapability('publish_post', ['unipile'])?.key,
    ).toBe('linkedin');
  });
});
