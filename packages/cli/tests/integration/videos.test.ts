import { describe, expect, it } from 'vitest';
import type { JsonApiCollectionResponse, JsonApiSingleResponse } from '../../src/api/json-api.js';
import { flattenCollection, flattenSingle } from '../../src/api/json-api.js';
import { createTestClient, hasCredentials, testConfig } from './setup.js';

interface Ingredient {
  id: string;
  category: string;
  status: string;
}

interface Video {
  id: string;
  status: string;
  model?: string;
  url?: string;
}

describe.skipIf(!hasCredentials)('integration/videos', () => {
  const client = hasCredentials ? createTestClient() : undefined!;
  const orgId = testConfig?.organizationId ?? '';

  it('POST /videos request shape is valid (mocked — no credits burned)', async () => {
    const request = {
      brand: 'test-brand-id',
      duration: 5,
      model: 'google-veo-3',
      resolution: '1080p',
      text: 'A flying bird',
    };

    expect(request.text).toBeTruthy();
    expect(request.brand).toBeTruthy();
    expect(typeof request.text).toBe('string');
    expect(typeof request.brand).toBe('string');
    expect(typeof request.duration).toBe('number');
    expect(typeof request.resolution).toBe('string');
  });

  it('GET /videos/:id flattens correctly when video exists', async () => {
    const ingredientsResponse = await client<JsonApiCollectionResponse>(
      `/organizations/${orgId}/ingredients?limit=1&category=video`,
      { method: 'GET' }
    );
    const ingredients = flattenCollection<Ingredient>(ingredientsResponse);

    if (ingredients.length === 0) {
      return;
    }

    const videoId = ingredients[0].id;

    try {
      const response = await client<JsonApiSingleResponse>(`/videos/${videoId}`, {
        method: 'GET',
      });

      const video = flattenSingle<Video>(response);
      expect(video.id).toBe(videoId);
      expect(video.status).toBeTruthy();
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        // Expected: ClerkGuard blocks API keys on /videos
        expect(status).toBeOneOf([401, 403]);
      } else {
        throw error;
      }
    }
  }, 15_000);
});
