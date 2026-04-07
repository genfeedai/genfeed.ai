import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalGalleryFooter from '@ui/modals/gallery/ModalGalleryFooter';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/navigation/pagination/Pagination', () => ({
  default: ({ currentPage, totalPages, onPageChange }: any) => (
    <div data-testid="pagination">
      <button onClick={() => onPageChange(currentPage + 1)}>Next</button>
      <span>
        Page {currentPage} of {totalPages}
      </span>
    </div>
  ),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ label, onClick, isDisabled }: any) => (
    <button onClick={onClick} disabled={isDisabled}>
      {label}
    </button>
  ),
}));

vi.mock('@services/content/pages.service', () => ({
  PagesService: {
    getCurrentPage: () => 1,
    getTotalPages: () => 5,
  },
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://test.com/ingredients',
  },
}));

describe('ModalGalleryFooter', () => {
  const defaultProps = {
    activeTab: 'media' as const,
    category: 'image' as const,
    isLoading: false,
    isNoneAllowed: false,
    onClear: vi.fn(),
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    onPageChange: vi.fn(),
    onSelect: vi.fn(),
    onSelectAccountReference: vi.fn(),
    selectedItem: '',
    selectedItems: [],
    selectedItemsData: [],
  };

  it('renders pagination when not loading', () => {
    render(<ModalGalleryFooter {...defaultProps} />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
  });

  it('does not render pagination when loading', () => {
    render(<ModalGalleryFooter {...defaultProps} isLoading={true} />);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('renders image action buttons for media tab when items selected', () => {
    render(
      <ModalGalleryFooter
        {...defaultProps}
        selectedItems={['img-1', 'img-2']}
        selectedItemsData={[{ id: 'img-1' }, { id: 'img-2' }] as any}
      />,
    );
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('Select Images (2)')).toBeInTheDocument();
  });

  it('renders reference action buttons for references tab when items selected', () => {
    render(
      <ModalGalleryFooter
        {...defaultProps}
        activeTab="references"
        selectedItems={['ref-1']}
      />,
    );
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('Select References (1)')).toBeInTheDocument();
  });

  it('renders music action buttons for music category', () => {
    render(<ModalGalleryFooter {...defaultProps} category="music" />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Continue Without Music')).toBeInTheDocument();
  });

  it('calls onClear when clear button is clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <ModalGalleryFooter
        {...defaultProps}
        selectedItems={['img-1']}
        onClear={onClear}
      />,
    );
    const clearButton = screen.getByText('Clear');
    await user.click(clearButton);
    expect(onClear).toHaveBeenCalled();
  });

  it('calls onSelect when select button is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ModalGalleryFooter
        {...defaultProps}
        selectedItems={['img-1']}
        selectedItemsData={[{ id: 'img-1' }] as any}
        onSelect={onSelect}
      />,
    );
    const selectButton = screen.getByText('Select Images (1)');
    await user.click(selectButton);
    expect(onSelect).toHaveBeenCalled();
  });

  it('disables music confirm button when no item selected and isNoneAllowed is false', () => {
    render(<ModalGalleryFooter {...defaultProps} category="music" />);
    const confirmButton = screen.getByText('Continue Without Music');
    expect(confirmButton).toBeDisabled();
  });

  it('enables music confirm button when isNoneAllowed is true', () => {
    render(
      <ModalGalleryFooter
        {...defaultProps}
        category="music"
        isNoneAllowed={true}
      />,
    );
    const confirmButton = screen.getByText('Continue Without Music');
    expect(confirmButton).not.toBeDisabled();
  });

  it('renders uploads tab action buttons when items selected', () => {
    render(
      <ModalGalleryFooter
        {...defaultProps}
        activeTab="uploads"
        selectedItems={['img-1']}
        selectedItemsData={[{ id: 'img-1' }] as any}
      />,
    );
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('Select Images (1)')).toBeInTheDocument();
  });

  it('calls onSelect with single item for uploads tab', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ModalGalleryFooter
        {...defaultProps}
        activeTab="uploads"
        selectedItems={['img-1']}
        selectedItemsData={[{ id: 'img-1' }] as any}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    const selectButton = screen.getByText('Select Images (1)');
    await user.click(selectButton);
    expect(onSelect).toHaveBeenCalledWith({ id: 'img-1' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onSelect with multiple items for uploads tab', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ModalGalleryFooter
        {...defaultProps}
        activeTab="uploads"
        selectedItems={['img-1', 'img-2']}
        selectedItemsData={[{ id: 'img-1' }, { id: 'img-2' }] as any}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    const selectButton = screen.getByText('Select Images (2)');
    await user.click(selectButton);
    expect(onSelect).toHaveBeenCalledWith([{ id: 'img-1' }, { id: 'img-2' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onSelectAccountReference for references tab', async () => {
    const user = userEvent.setup();
    const onSelectAccountReference = vi.fn();
    const onClose = vi.fn();
    render(
      <ModalGalleryFooter
        {...defaultProps}
        activeTab="references"
        selectedItems={['ref-1']}
        onSelectAccountReference={onSelectAccountReference}
        onClose={onClose}
      />,
    );
    const selectButton = screen.getByText('Select References (1)');
    await user.click(selectButton);
    expect(onSelectAccountReference).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Select Music button when music is selected', () => {
    render(
      <ModalGalleryFooter
        {...defaultProps}
        category="music"
        selectedItem="music-1"
      />,
    );
    expect(screen.getByText('Select Music')).toBeInTheDocument();
  });

  it('shows Clear button when music is selected', () => {
    render(
      <ModalGalleryFooter
        {...defaultProps}
        category="music"
        selectedItem="music-1"
      />,
    );
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('calls onSelect with null when music clear is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ModalGalleryFooter
        {...defaultProps}
        category="music"
        selectedItem="music-1"
        onSelect={onSelect}
      />,
    );
    const clearButton = screen.getByText('Clear');
    await user.click(clearButton);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('calls onConfirm when music confirm is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ModalGalleryFooter
        {...defaultProps}
        category="music"
        selectedItem="music-1"
        onConfirm={onConfirm}
      />,
    );
    const confirmButton = screen.getByText('Select Music');
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onClose when Cancel button is clicked for music', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalGalleryFooter
        {...defaultProps}
        category="music"
        onClose={onClose}
      />,
    );
    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not show action buttons when no items selected for media tab', () => {
    render(<ModalGalleryFooter {...defaultProps} selectedItems={[]} />);
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    expect(screen.queryByText(/Select Images/)).not.toBeInTheDocument();
  });

  it('does not show action buttons when no items selected for references tab', () => {
    render(
      <ModalGalleryFooter
        {...defaultProps}
        activeTab="references"
        selectedItems={[]}
      />,
    );
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    expect(screen.queryByText(/Select References/)).not.toBeInTheDocument();
  });

  it('calls onPageChange when pagination changes', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <ModalGalleryFooter {...defaultProps} onPageChange={onPageChange} />,
    );
    const nextButton = screen.getByText('Next');
    await user.click(nextButton);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
