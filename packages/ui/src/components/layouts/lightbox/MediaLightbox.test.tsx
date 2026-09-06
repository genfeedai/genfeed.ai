import { IngredientCategory } from '@genfeedai/contracts';
import { render, waitFor } from '@testing-library/react';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import { describe, expect, it, vi } from 'vitest';

const { lightbox } = vi.hoisted(() => ({ lightbox: vi.fn() }));
vi.mock('yet-another-react-lightbox', () => ({
  default: (props: unknown) => {
    lightbox(props);
    return <div data-testid="lightbox" />;
  },
}));

vi.mock('yet-another-react-lightbox/plugins/video', () => ({
  default: vi.fn(),
}));

vi.mock('yet-another-react-lightbox/plugins/captions', () => ({
  default: vi.fn(),
}));

vi.mock('yet-another-react-lightbox/plugins/thumbnails', () => ({
  default: vi.fn(),
}));

describe('MediaLightbox', () => {
  it('does not use video files as image posters when thumbnails are missing', async () => {
    render(
      <MediaLightbox
        items={[
          {
            id: 'video',
            category: IngredientCategory.VIDEO,
            ingredientUrl: 'https://cdn.test/video.mp4',
          },
        ]}
        open
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(lightbox).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: [
            expect.objectContaining({
              type: 'video',
              poster: undefined,
              thumbnailSrc: undefined,
            }),
          ],
        }),
      ),
    );
  });

  it('should render without crashing', () => {
    const { container } = render(
      <MediaLightbox items={[]} open={false} onClose={vi.fn()} />,
    );
    expect(container).toBeInTheDocument();
  });

  it('should render with items', () => {
    const items = [
      {
        id: '1',
        ingredientUrl: 'https://example.com/image.jpg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
      },
    ];
    const { container } = render(
      <MediaLightbox
        items={items}
        open={true}
        onClose={vi.fn()}
        startIndex={0}
      />,
    );
    expect(container).toBeInTheDocument();
  });

  it('should handle empty items array', () => {
    const { container } = render(
      <MediaLightbox items={[]} open={true} onClose={vi.fn()} />,
    );
    expect(container).toBeInTheDocument();
  });
});
