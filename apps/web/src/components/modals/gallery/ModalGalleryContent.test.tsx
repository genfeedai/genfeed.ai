import { IngredientCategory } from '@genfeedai/contracts';
import type { IAsset, IMusic } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModalGalleryContent from '@/components/modals/gallery/ModalGalleryContent';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/components/modals/gallery/items/ModalGalleryItemMusic', () => ({
  default: ({ music }: { music: IMusic }) => <p>{music.id}</p>,
}));

vi.mock('@/components/modals/gallery/ModalGalleryReferencesTab', () => ({
  default: ({ references }: { references: IAsset[] }) => (
    <p>{`${references.length} references`}</p>
  ),
}));

const defaultProps = {
  activeTab: 'media' as const,
  category: IngredientCategory.MUSIC,
  isLoading: false,
  items: [],
  onSelectItem: vi.fn(),
  onSelectReference: vi.fn(),
  onSelectionLimit: vi.fn(),
  selectedItem: '',
  selectedItems: [],
  selectionLimit: Infinity,
};

describe('ModalGalleryContent', () => {
  it('lists music tracks', () => {
    render(
      <ModalGalleryContent
        {...defaultProps}
        items={[{ id: 'track-1' } as IMusic, { id: 'track-2' } as IMusic]}
      />,
    );

    expect(screen.getByText('track-1')).toBeInTheDocument();
    expect(screen.getByText('track-2')).toBeInTheDocument();
  });

  it('says when there is no music yet', () => {
    render(<ModalGalleryContent {...defaultProps} />);

    expect(screen.getByText('No music tracks available')).toBeInTheDocument();
  });

  it('shows brand references on the Branding tab', () => {
    render(
      <ModalGalleryContent
        {...defaultProps}
        activeTab="references"
        category={IngredientCategory.IMAGE}
        references={[{ id: 'ref-1' } as IAsset]}
      />,
    );

    expect(screen.getByText('1 references')).toBeInTheDocument();
  });
});
