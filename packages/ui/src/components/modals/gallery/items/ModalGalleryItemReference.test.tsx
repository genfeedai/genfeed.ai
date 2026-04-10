import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalGalleryItemReference from '@ui/modals/gallery/items/ModalGalleryItemReference';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('next/image', () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'http://api.example.com/ingredients',
  },
}));

describe('ModalGalleryItemReference', () => {
  const defaultProps = {
    isSelected: false,
    onSelect: vi.fn(),
    onSelectionLimit: vi.fn(),
    reference: {
      id: 'ref-1',
      url: 'http://example.com/ref.jpg',
    },
    selectedItems: [],
    selectionLimit: Infinity,
  };

  it('renders reference item', () => {
    render(<ModalGalleryItemReference {...defaultProps} />);
    expect(screen.getByAltText('ref-1')).toBeInTheDocument();
  });

  it('displays selection indicator when selected', () => {
    render(<ModalGalleryItemReference {...defaultProps} isSelected={true} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('calls onSelect when clicked and not selected', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ModalGalleryItemReference {...defaultProps} onSelect={onSelect} />);
    const item = screen.getByAltText('ref-1').closest('div');
    await user.click(item!);
    expect(onSelect).toHaveBeenCalledWith(['ref-1']);
  });

  it('calls onSelect to remove when already selected', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ModalGalleryItemReference
        {...defaultProps}
        isSelected={true}
        selectedItems={['ref-1']}
        onSelect={onSelect}
      />,
    );
    const item = screen.getByAltText('ref-1').closest('div');
    await user.click(item!);
    expect(onSelect).toHaveBeenCalledWith([]);
  });

  it('calls onSelectionLimit when limit is reached', async () => {
    const user = userEvent.setup();
    const onSelectionLimit = vi.fn();
    // When selectionLimit > 1 and selectedItems.length >= selectionLimit, onSelectionLimit is called
    render(
      <ModalGalleryItemReference
        {...defaultProps}
        selectionLimit={2}
        selectedItems={['ref-2', 'ref-3']}
        onSelectionLimit={onSelectionLimit}
      />,
    );
    const item = screen.getByAltText('ref-1').closest('div');
    await user.click(item!);
    expect(onSelectionLimit).toHaveBeenCalled();
  });

  it('replaces selection when selectionLimit is 1', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ModalGalleryItemReference
        {...defaultProps}
        selectionLimit={1}
        selectedItems={['ref-2']}
        onSelect={onSelect}
      />,
    );
    const item = screen.getByAltText('ref-1').closest('div');
    await user.click(item!);
    // When selectionLimit is 1, it replaces the selection with the new item
    expect(onSelect).toHaveBeenCalledWith(['ref-1']);
  });
});
