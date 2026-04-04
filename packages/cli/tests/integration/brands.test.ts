import { describe, expect, it } from 'vitest';
import type { JsonApiCollectionResponse, JsonApiSingleResponse } from '../../src/api/json-api.js';
import { flattenCollection, flattenSingle } from '../../src/api/json-api.js';
import { createTestClient, hasCredentials, testConfig } from './setup.js';

interface Brand {
  id: string;
  label: string;
  handle?: string;
  description?: string;
}

describe.skipIf(!hasCredentials)('integration/brands', () => {
  const client = hasCredentials ? createTestClient() : undefined!;
  const orgId = testConfig?.organizationId ?? '';

  it('listBrands returns array with id and label', async () => {
    const response = await client<JsonApiCollectionResponse>(`/organizations/${orgId}/brands`, {
      method: 'GET',
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);

    const brands = flattenCollection<Brand>(response);
    expect(Array.isArray(brands)).toBe(true);

    if (brands.length > 0) {
      const brand = brands[0];
      expect(brand.id).toBeTruthy();
      expect(typeof brand.id).toBe('string');
      expect(brand.label).toBeTruthy();
      expect(typeof brand.label).toBe('string');
    }
  }, 15_000);

  it('getBrand returns single brand with id and label', async () => {
    // First get a brand ID from the list
    const listResponse = await client<JsonApiCollectionResponse>(`/organizations/${orgId}/brands`, {
      method: 'GET',
    });
    const brands = flattenCollection<Brand>(listResponse);

    if (brands.length === 0) {
      // Nothing to test — org has no brands
      return;
    }

    const brandId = brands[0].id;
    const response = await client<JsonApiSingleResponse>(`/brands/${brandId}`, {
      method: 'GET',
    });

    const brand = flattenSingle<Brand>(response);
    expect(brand.id).toBe(brandId);
    expect(brand.label).toBeTruthy();
  }, 15_000);

  it('JSON:API response has correct resource type', async () => {
    const response = await client<JsonApiCollectionResponse>(`/organizations/${orgId}/brands`, {
      method: 'GET',
    });

    if (response.data.length > 0) {
      expect(response.data[0].type).toBe('brand');
      expect(response.data[0].attributes).toBeDefined();
      expect(typeof response.data[0].attributes).toBe('object');
    }
  }, 15_000);
});
