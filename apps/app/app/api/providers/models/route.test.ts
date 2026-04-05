import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/providers/models', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('treats X-Fal-Key as a configured fal provider', async () => {
    delete process.env.FAL_API_KEY;

    const request = new NextRequest('http://localhost/api/providers/models?provider=fal', {
      headers: {
        'X-Fal-Key': 'fal_test_key',
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(body.configuredProviders).toContain('fal');
    expect(
      body.models.some((model: { id: string }) => model.id === 'fal-ai/nano-banana-2/edit')
    ).toBe(true);
  });
});
