import { render } from '@testing-library/react';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';
import { describe, expect, it, vi } from 'vitest';

vi.mock('yet-another-react-lightbox', () => ({
  default: () => <div data-testid="lightbox" />,
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
