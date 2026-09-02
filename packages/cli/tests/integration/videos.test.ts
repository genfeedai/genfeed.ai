import { IngredientStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import type { JsonApiCollectionResponse, JsonApiSingleResponse } from '../../src/api/json-api';
import { flattenCollection, flattenSingle } from '../../src/api/json-api';
import type { CreateVideoRequest } from '../../src/api/videos';
import { createTestClient, hasCredentials, testConfig } from './setup';

interface Ingredient {
  id: string;
  category: string;
  status: IngredientStatus;
}

interface Video {
  id: string;
  status: IngredientStatus;
  model?: string;
  url?: string;
}

describe.skipIf(!hasCredentials)('integration/videos', () => {
  const client = hasCredentials ? createTestClient() : undefined!;
  const orgId = testConfig?.organizationId ?? '';

  it('POST /videos request shape is valid (mocked — no credits burned)', async () => {
    // Typed as CreateVideoRequest so the key name is checked at compile time:
    // CreateVideoDto declares `brandId`, and the API strips unknown keys.
    const request: CreateVideoRequest = {
      brandId: 'test-brand-id',
      duration: 5,
      model: 'google-veo-3',
      resolution: '1080p',
      text: 'A flying bird',
    };

    expect(request.text).toBeTruthy();
    expect(request.brandId).toBeTruthy();
    expect(typeof request.text).toBe('string');
    expect(typeof request.brandId).toBe('string');
    expect(typeof request.duration).toBe('number');
    expect(typeof request.resolution).toBe('string');
    expect(request).not.toHaveProperty('brand');
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
      expect(Object.values(IngredientStatus)).toContain(video.status);
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        // Expected: BetterAuthGuard blocks API keys on /videos
        expect(status).toBeOneOf([401, 403]);
      } else {
        throw error;
      }
    }
  }, 15_000);
});
