import type { Brand } from '@models/organization/brand.model';
import { describe, expect, it, vi } from 'vitest';

const getPublicBrandBySlug = vi.fn<() => Promise<Brand | null>>(() => {
  throw new Error('profile service unreachable');
});
const infoSpy = vi.fn();

vi.mock('@u/[handle]/profile-loader', () => ({
  getPublicBrandBySlug,
  getPublicProfilePageData: vi.fn(),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: infoSpy, warn: vi.fn() },
}));

const { generateMetadata } = await import('./page');

const EMPTY_PARENT = Promise.resolve({}) as unknown as Parameters<
  typeof generateMetadata
>[1];

describe('public profile generateMetadata fallback', () => {
  it('logs the degradation and returns handle-only metadata', async () => {
    const meta = await generateMetadata(
      { params: Promise.resolve({ handle: 'unreachable' }) },
      EMPTY_PARENT,
    );

    expect(meta.title).toContain('unreachable');
    expect(meta.description).toContain('unreachable');
    expect(meta.openGraph).toBeUndefined();
    expect(meta.alternates).toBeUndefined();
    expect(infoSpy).toHaveBeenCalledWith(
      'GET /public/brands/unreachable degraded to fallback metadata',
      expect.objectContaining({ handle: 'unreachable' }),
    );
  });
});
