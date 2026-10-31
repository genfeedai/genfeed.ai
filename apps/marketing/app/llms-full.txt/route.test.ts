import type { PublicModelCatalogItem } from '@public/models/models-loader';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPublicModels = vi.fn<() => Promise<PublicModelCatalogItem[] | null>>();

vi.mock('@public/models/models-loader', () => ({
  getPublicModels: () => getPublicModels(),
}));

const route = await import('./route');

function catalogModel(
  key: string,
  label: string,
  category: string,
): PublicModelCatalogItem {
  return {
    aspectRatios: [],
    capabilities: [],
    category,
    durations: [],
    id: key,
    isDefault: false,
    isHighlighted: false,
    key,
    label,
    provider: 'replicate',
    recommendedFor: [],
    supportsFeatures: [],
  };
}

async function modelSection(): Promise<{ body: string; listed: string[] }> {
  const response = await route.GET();
  const body = await response.text();
  const start = body.indexOf('## AI Models');
  const end = body.indexOf('\n---', start);
  const section = body.slice(start, end);
  return {
    body: section,
    listed: section
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2)),
  };
}

describe('/llms-full.txt', () => {
  beforeEach(() => {
    getPublicModels.mockReset();
  });

  it('is cached and regenerated like the /models catalog page', () => {
    expect('dynamic' in route).toBe(false);
    expect(route.revalidate).toBe(300);
  });

  it('serves plain text', async () => {
    getPublicModels.mockResolvedValue([]);

    const response = await route.GET();

    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(await response.text()).toContain('# Genfeed.ai');
  });

  it('lists exactly the models the live public catalog offers', async () => {
    getPublicModels.mockResolvedValue([
      catalogModel('google/veo-3.1', 'Veo 3.1', 'video'),
      catalogModel('bytedance/seedance-2.5', 'Seedance 2.5', 'video'),
      catalogModel('google/nano-banana-2', 'Nano Banana 2', 'image'),
      // The same model offered through a second provider row is one model.
      catalogModel('fal-ai/nano-banana-2', 'Nano Banana 2', 'image'),
      catalogModel('openai/text-embedding-3', 'Embeddings', 'embedding'),
    ]);

    const { body, listed } = await modelSection();

    expect(listed).toEqual(['Nano Banana 2', 'Seedance 2.5', 'Veo 3.1']);
    expect(body).toContain('Genfeed currently offers 3 AI models');
    expect(body.indexOf('### Image Generation')).toBeLessThan(
      body.indexOf('### Video Generation'),
    );
    // Registry keys the catalog hides (inactive, uncurated or unpriceable)
    // must not reappear from a static key list.
    expect(body).not.toMatch(/hailuo/i);
    expect(body).not.toContain('Embeddings');
  });

  it('prints no model list when the catalog cannot be read', async () => {
    getPublicModels.mockResolvedValue(null);

    const { body, listed } = await modelSection();

    expect(listed).toEqual([]);
    expect(body).toContain('https://genfeed.ai/models');
    expect(body).toContain('https://api.genfeed.ai/v1/public/models');
  });
});
