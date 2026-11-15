import { HiggsfieldDocsCatalogClient } from '@workers/crons/higgsfield-model-watcher/higgsfield-docs-catalog.client';
import { describe, expect, it } from 'vitest';

const BASE = 'https://docs.higgsfield.ai/docs/models';

const PAGES: Record<string, string> = {
  [`${BASE}/video-generation.md`]: `[Genjutsu](${BASE}/genjutsu.md)`,
  [`${BASE}/image-generation.md`]: `[SOUL V2](${BASE}/soul-2.md) [Soul ID](${BASE}/soul-id.md)`,
  [`${BASE}/genjutsu.md`]: `[Restyle](${BASE}/genjutsu/restyle.md)`,
  [`${BASE}/soul-2.md`]: `[Generate](${BASE}/soul-2/generate.md)`,
  [`${BASE}/soul-id.md`]: `[Create](${BASE}/soul-id/create-character.md)`,
  [`${BASE}/genjutsu/restyle.md`]:
    '# Genjutsu — Restyle API\n\n**Endpoint ID:** `higgsfield/genjutsu/restyle/v1.0`\n',
  [`${BASE}/soul-2/generate.md`]:
    '# SOUL V2 — Text to image API\n\n**Endpoint ID:** `higgsfield-ai/soul/v2/standard`\n',
  [`${BASE}/soul-id/create-character.md`]:
    '# Soul ID — Create character API\n\n**Catalog ID:** `soul-id`\n',
};

function createClient(
  pages: Record<string, string>,
): HiggsfieldDocsCatalogClient {
  const fetcher = (async (input: string | URL | Request) => {
    const body = pages[String(input)];
    return body === undefined
      ? new Response('missing', { status: 404 })
      : new Response(body, { status: 200 });
  }) as typeof fetch;
  return new HiggsfieldDocsCatalogClient({ warn: () => undefined } as never, {
    fetcher,
  });
}

describe('HiggsfieldDocsCatalogClient', () => {
  it('reads every endpoint through the index, family and workflow pages', async () => {
    const snapshot = await createClient(PAGES).fetchCatalog();

    expect(snapshot.failedUrls).toEqual([]);
    expect(snapshot.entries).toEqual([
      {
        category: 'video',
        endpoint: 'higgsfield/genjutsu/restyle/v1.0',
        label: 'Genjutsu Restyle',
        sourceUrl: `${BASE}/genjutsu/restyle.md`,
      },
      {
        category: 'image',
        endpoint: 'higgsfield-ai/soul/v2/standard',
        label: 'SOUL V2 Text to image',
        sourceUrl: `${BASE}/soul-2/generate.md`,
      },
    ]);
  });

  it('lists the pages it could not read so a partial catalog is never trusted', async () => {
    const { [`${BASE}/genjutsu/restyle.md`]: _gone, ...pages } = PAGES;

    const snapshot = await createClient(pages).fetchCatalog();

    expect(snapshot.failedUrls).toEqual([`${BASE}/genjutsu/restyle.md`]);
    expect(snapshot.entries.map((entry) => entry.endpoint)).toEqual([
      'higgsfield-ai/soul/v2/standard',
    ]);
  });
});
