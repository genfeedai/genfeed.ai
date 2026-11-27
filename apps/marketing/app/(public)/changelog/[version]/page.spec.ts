import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPublishedReleases = vi.fn();
vi.mock('@data/releases.data', () => ({ getPublishedReleases }));

const { default: ReleasePage, generateMetadata } = await import('./page');

const parent = Promise.resolve({ openGraph: { images: [] } }) as never;

beforeEach(() => {
  getPublishedReleases.mockReset();
  getPublishedReleases.mockResolvedValue([
    {
      body: '### Features\n\n- palette',
      publishedAt: '2026-09-01T00:00:00Z',
      tag: 'v1.0.0',
      url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v1.0.0',
    },
  ]);
});

describe('release page', () => {
  it('describes the release and canonicalises to its own address', async () => {
    const metadata = await generateMetadata(
      { params: Promise.resolve({ version: 'v1.0.0' }) },
      parent,
    );

    expect(metadata.title).toBe('v1.0.0 release notes | Genfeed.ai');
    expect(metadata.description).toContain('Features');
    expect(metadata.alternates?.canonical).toBe(
      'https://genfeed.ai/changelog/v1.0.0',
    );
  });

  it('keeps a version that was never released out of the index', async () => {
    const metadata = await generateMetadata(
      { params: Promise.resolve({ version: 'v9.9.9' }) },
      parent,
    );

    expect(metadata.robots).toEqual({ follow: false, index: false });
  });

  it('answers 404 for a version that was never released', async () => {
    await expect(
      ReleasePage({ params: Promise.resolve({ version: 'v9.9.9' }) }),
    ).rejects.toThrow();
  });
});
