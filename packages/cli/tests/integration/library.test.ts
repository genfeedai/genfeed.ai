import { describe, expect, it } from 'vitest';
import type { JsonApiCollectionResponse } from '../../src/api/json-api.js';
import { flattenCollection } from '../../src/api/json-api.js';
import { createTestClient, hasCredentials, testConfig } from './setup.js';

interface Ingredient {
  id: string;
  category: string;
  status: string;
  text?: string;
  model?: string;
}

describe.skipIf(!hasCredentials)('integration/library', () => {
  const client = hasCredentials ? createTestClient() : undefined!;
  const orgId = testConfig?.organizationId ?? '';

  it('GET /organizations/:orgId/ingredients returns JSON:API collection', async () => {
    const response = await client<JsonApiCollectionResponse>(
      `/organizations/${orgId}/ingredients?limit=5`,
      { method: 'GET' }
    );

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  }, 15_000);

  it('flattened ingredients have id, category, and status', async () => {
    const response = await client<JsonApiCollectionResponse>(
      `/organizations/${orgId}/ingredients?limit=5`,
      { method: 'GET' }
    );

    const items = flattenCollection<Ingredient>(response);

    if (items.length > 0) {
      const item = items[0];
      expect(item.id).toBeTruthy();
      expect(typeof item.id).toBe('string');
      expect(item.category).toBeTruthy();
      expect(typeof item.category).toBe('string');
      expect(item.status).toBeTruthy();
      expect(typeof item.status).toBe('string');
    }
  }, 15_000);

  it('category filter works', async () => {
    const response = await client<JsonApiCollectionResponse>(
      `/organizations/${orgId}/ingredients?limit=5&category=image`,
      { method: 'GET' }
    );

    const items = flattenCollection<Ingredient>(response);

    for (const item of items) {
      expect(item.category).toBe('image');
    }
  }, 15_000);

  it('JSON:API response has correct resource structure', async () => {
    const response = await client<JsonApiCollectionResponse>(
      `/organizations/${orgId}/ingredients?limit=1`,
      { method: 'GET' }
    );

    if (response.data.length > 0) {
      const resource = response.data[0];
      expect(resource.id).toBeTruthy();
      expect(resource.type).toBeTruthy();
      expect(resource.attributes).toBeDefined();
      expect(typeof resource.attributes).toBe('object');
    }
  }, 15_000);
});
