import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalGalleryItemVideo from '@ui/modals/gallery/items/ModalGalleryItemVideo';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/masonry/video/MasonryVideo', () => ({
  default: ({ video, onClickIngredient }: any) => (
    <div data-testid={`masonry-video-${video.id}`} onClick={onClickIngredient}>
      {video.id}
    </div>
  ),
}));

describe('ModalGalleryItemVideo', () => {
  const defaultProps = {
    onSelect: vi.fn(),
    video: {
      id: 'vid-1',
    },
  };

  it('renders video item', () => {
    render(<ModalGalleryItemVideo {...defaultProps} />);
    expect(screen.getByTestId('masonry-video-vid-1')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ModalGalleryItemVideo {...defaultProps} onSelect={onSelect} />);
    const video = screen.getByTestId('masonry-video-vid-1');
    await user.click(video);
    expect(onSelect).toHaveBeenCalledWith(defaultProps.video);
  });
});
