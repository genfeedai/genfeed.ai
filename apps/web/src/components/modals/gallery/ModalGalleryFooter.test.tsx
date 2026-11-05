import { IngredientCategory } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModalGalleryFooter from '@/components/modals/gallery/ModalGalleryFooter';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/navigation/pagination/Pagination', () => ({
  default: ({
    currentPage,
    totalPages,
  }: {
    currentPage: number;
    totalPages: number;
  }) => (
    <nav aria-label="Pages">
      Page {currentPage} of {totalPages}
    </nav>
  ),
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: { cdnUrl: 'https://cdn.test' },
}));

function renderFooter(
  overrides: Partial<Parameters<typeof ModalGalleryFooter>[0]> = {},
) {
  const props = {
    activeTab: 'media' as const,
    category: IngredientCategory.VIDEO,
    currentPage: 1,
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
    totalPages: 3,
    ...overrides,
  };
  render(<ModalGalleryFooter {...props} />);
  return props;
}

describe('ModalGalleryFooter', () => {
  it('cannot add from the Library until something is picked', () => {
    renderFooter();

    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('counts the picks and adds them', () => {
    const props = renderFooter({ selectedItems: ['a', 'b'] });

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add 2' }));

    expect(props.onConfirm).toHaveBeenCalledOnce();
  });

  it('hands brand references back as reference links', () => {
    const props = renderFooter({
      activeTab: 'references',
      category: IngredientCategory.IMAGE,
      selectedItems: ['ref-1'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add 1' }));

    expect(props.onSelectAccountReference).toHaveBeenCalledWith([
      { id: 'ref-1', url: 'https://cdn.test/references/ref-1' },
    ]);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('lets a music pick continue without a track only when allowed', () => {
    renderFooter({ category: IngredientCategory.MUSIC, isNoneAllowed: true });

    expect(
      screen.getByRole('button', { name: 'Continue Without Music' }),
    ).toBeEnabled();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('clears a chosen track with an empty selection', () => {
    const props = renderFooter({
      category: IngredientCategory.MUSIC,
      selectedItem: 'track-1',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(props.onSelect).toHaveBeenCalledWith([]);
  });
});
