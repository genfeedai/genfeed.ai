import { describe, expect, it } from 'vitest';
import type { JsonApiCollectionResponse } from '../../src/api/json-api.js';
import { flattenCollection } from '../../src/api/json-api.js';
import { createTestClient, hasCredentials } from './setup.js';

interface Persona {
  id: string;
  label: string;
  handle: string;
  bio?: string;
  status?: string;
}

describe.skipIf(!hasCredentials)('integration/personas', () => {
  const client = hasCredentials ? createTestClient() : undefined!;

  it('GET /personas returns JSON:API collection', async () => {
    const response = await client<JsonApiCollectionResponse>('/personas', {
      method: 'GET',
    });

    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
  }, 15_000);

  it('flattened personas have id, label, and handle', async () => {
    const response = await client<JsonApiCollectionResponse>('/personas', {
      method: 'GET',
    });

    const personas = flattenCollection<Persona>(response);

    if (personas.length > 0) {
      const persona = personas[0];
      expect(persona.id).toBeTruthy();
      expect(typeof persona.id).toBe('string');
      expect(persona.label).toBeTruthy();
      expect(typeof persona.label).toBe('string');
      expect(persona.handle).toBeTruthy();
      expect(typeof persona.handle).toBe('string');
    }
  }, 15_000);

  it('JSON:API response has persona type', async () => {
    const response = await client<JsonApiCollectionResponse>('/personas', {
      method: 'GET',
    });

    if (response.data.length > 0) {
      expect(response.data[0].type).toBe('persona');
      expect(response.data[0].attributes).toBeDefined();
    }
  }, 15_000);
});
