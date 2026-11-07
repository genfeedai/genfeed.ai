import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', async () => {
  const { default: Lightbox } = await import('yet-another-react-lightbox');
  return { default: () => Lightbox };
});

vi.mock('@genfeedai/hooks/ui/use-dominant-color/use-dominant-color', () => ({
  useDominantColor: () => null,
}));

const grants = vi.hoisted(() => ({
  current: null as null | {
    expiresAt: string | null;
    id: string;
    purpose: string;
    state: string;
    url: string | null;
  },
}));

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => grants.current,
}));

const image = {
  id: 'apple',
  ingredientUrl: 'https://example.com/apple.jpg',
  thumbnailUrl: 'https://example.com/apple.jpg',
  metadataLabel: 'Apple',
} as IIngredient;

describe('MediaLightbox', () => {
  it('plays the video from its authorized grant when the row URL is empty', async () => {
    grants.current = {
      expiresAt: null,
      id: 'clip',
      purpose: 'preview',
      state: 'READY',
      url: 'https://cdn.test/signed-video.mp4',
    };
    render(
      <MediaLightbox
        items={[
          {
            ...image,
            category: IngredientCategory.VIDEO,
            ingredientUrl: '',
            thumbnailUrl: 'https://assets.test/placeholders/portrait.jpg',
          },
        ]}
        startIndex={0}
        open
        onClose={vi.fn()}
      />,
    );
    const video = await screen.findByLabelText('Media lightbox video');
    expect(video).toHaveAttribute('src', 'https://cdn.test/signed-video.mp4');
    expect(video).not.toHaveAttribute('poster');
  });

  it('waits on a pending grant instead of loading a placeholder video', async () => {
    grants.current = {
      expiresAt: null,
      id: 'clip',
      purpose: 'preview',
      state: 'PENDING',
      url: null,
    };
    render(
      <MediaLightbox
        items={[
          {
            ...image,
            category: IngredientCategory.VIDEO,
            ingredientUrl: '',
          },
        ]}
        startIndex={0}
        open
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Media lightbox video'),
    ).not.toBeInTheDocument();
  });

  it('plays a video without a grant from its own URL', async () => {
    grants.current = null;
    render(
      <MediaLightbox
        items={[
          {
            ...image,
            category: IngredientCategory.VIDEO,
            ingredientUrl: 'https://cdn.test/video.mp4',
            thumbnailUrl: undefined,
          },
        ]}
        startIndex={0}
        open
        onClose={vi.fn()}
      />,
    );
    const video = await screen.findByLabelText('Media lightbox video');
    expect(video).toHaveAttribute('src', 'https://cdn.test/video.mp4');
    expect(video).not.toHaveAttribute('poster');
  });

  it('opens the real viewer while the dominant colour is unavailable', async () => {
    render(
      <MediaLightbox items={[image]} open startIndex={0} onClose={vi.fn()} />,
    );
    expect(
      await screen.findByRole('dialog', { name: 'Lightbox' }),
    ).toBeInTheDocument();
  });

  it('shows the asset full size without its prompt caption', async () => {
    render(
      <MediaLightbox
        items={[
          {
            ...image,
            promptText:
              'Generate a cheap five-second video of the same blue ceramic cup',
          },
        ]}
        open
        startIndex={0}
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('dialog', { name: 'Lightbox' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Generate a cheap five-second video/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/brand harness/)).not.toBeInTheDocument();
  });

  it('does not mount a closed viewer', () => {
    render(
      <MediaLightbox
        items={[image]}
        open={false}
        startIndex={0}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not mount a viewer without slides', () => {
    render(<MediaLightbox items={[]} open startIndex={0} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
