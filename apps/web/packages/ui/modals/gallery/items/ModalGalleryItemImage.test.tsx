import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalGalleryItemImage from '@ui/modals/gallery/items/ModalGalleryItemImage';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/masonry/image/MasonryImage', () => ({
  default: ({ image, onClickIngredient }: any) => (
    <div data-testid={`masonry-image-${image.id}`} onClick={onClickIngredient}>
      {image.id}
    </div>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ value }: any) => <span data-testid="format-badge">{value}</span>,
}));

describe('ModalGalleryItemImage', () => {
  const defaultProps = {
    getFormatLabel: vi.fn((format) => format || '9:16'),
    getImageFormat: vi.fn(() => 'portrait' as const),
    image: {
      height: 1920,
      id: 'img-1',
      width: 1080,
    },
    isSelected: false,
    localFormat: 'portrait' as const,
    onSelect: vi.fn(),
  };

  it('renders image item', () => {
    render(<ModalGalleryItemImage {...defaultProps} />);
    expect(screen.getByTestId('masonry-image-img-1')).toBeInTheDocument();
  });

  it('displays format badge when image format is available', () => {
    render(<ModalGalleryItemImage {...defaultProps} />);
    expect(screen.getByTestId('format-badge')).toBeInTheDocument();
  });

  it('displays selection indicator when selected', () => {
    render(<ModalGalleryItemImage {...defaultProps} isSelected={true} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('calls onSelect when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ModalGalleryItemImage {...defaultProps} onSelect={onSelect} />);
    const image = screen.getByTestId('masonry-image-img-1');
    await user.click(image);
    expect(onSelect).toHaveBeenCalledWith(defaultProps.image);
  });
});
