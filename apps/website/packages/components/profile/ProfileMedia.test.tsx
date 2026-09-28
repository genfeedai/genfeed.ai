import { IngredientStatus } from '@genfeedai/contracts';
import type { IImage, IVideo } from '@genfeedai/contracts/interfaces';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProfileImages from './ProfileImages';
import ProfileVideos from './ProfileVideos';

/**
 * Public profiles mount none of the app's providers (elements, prompt bar,
 * intl). These render the real masonry tiles with none of them,
 * the way `/u/<handle>` does, so a tile that reaches for an app context fails
 * here instead of on a live profile. The public API returns only generated
 * assets, so the failed-asset notice (the one part of a tile that translates)
 * never renders here.
 */
// A real page always has the App Router mounted; jsdom does not.
vi.mock('next/navigation', () => ({
  usePathname: () => '/u/genfeed',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// `next/dynamic` never resolves its chunk under vitest; load the same real
// tiles directly so the test still renders them with the profile's props.
vi.mock('@ui/lazy/masonry/LazyMasonry', async () => {
  const { default: MasonryImage } = await import(
    '@ui/masonry/image/MasonryImage'
  );
  const { default: MasonryVideo } = await import(
    '@ui/masonry/video/MasonryVideo'
  );
  return {
    LazyMasonryImage: MasonryImage,
    LazyMasonryVideo: MasonryVideo,
  };
});

const IMAGE = {
  id: 'image-1',
  ingredientUrl: 'https://cdn.genfeed.ai/image-1.jpg',
  metadata: { height: 1350, label: 'A public image', width: 1080 },
  status: IngredientStatus.GENERATED,
} as unknown as IImage;

const VIDEO = {
  id: 'video-1',
  ingredientUrl: 'https://cdn.genfeed.ai/video-1.mp4',
  metadata: { label: 'A public video' },
  status: IngredientStatus.GENERATED,
  thumbnailUrl: 'https://cdn.genfeed.ai/video-1.jpg',
} as unknown as IVideo;

describe('public profile media without app providers', () => {
  it('renders image tiles', async () => {
    const { container } = render(<ProfileImages images={[IMAGE]} />);

    await waitFor(() =>
      expect(
        container.querySelector('[data-masonry-item="true"]'),
      ).not.toBeNull(),
    );
  });

  it('renders video tiles', async () => {
    const { container } = render(<ProfileVideos videos={[VIDEO]} />);

    await waitFor(() =>
      expect(
        container.querySelector('[data-masonry-item="true"]'),
      ).not.toBeNull(),
    );
  });
});
