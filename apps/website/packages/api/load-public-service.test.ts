import { describe, expect, it, vi } from 'vitest';

const instance = { createPublicYoutubeClip: vi.fn() };

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => instance },
}));

describe('loadPublicService', () => {
  it('resolves the shared public API client', async () => {
    const { loadPublicService } = await import('./load-public-service');

    await expect(loadPublicService()).resolves.toBe(instance);
  });
});
