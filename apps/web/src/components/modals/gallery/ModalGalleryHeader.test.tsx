import { IngredientCategory, IngredientFormat } from '@genfeedai/contracts';
import type { IAsset } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModalGalleryHeader from '@/components/modals/gallery/ModalGalleryHeader';

const uploads = vi.hoisted(() => ({
  openUpload: vi.fn(),
  options: { onComplete: undefined as (() => void) | undefined },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useUploadModal: (options: { onComplete?: () => void }) => {
      uploads.options.onComplete = options.onComplete;
      return { openUpload: uploads.openUpload };
    },
  }),
);

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

const defaultProps = {
  accountReference: null,
  activeTab: 'media' as const,
  category: IngredientCategory.IMAGE,
  localFormat: IngredientFormat.PORTRAIT,
  onTabChange: vi.fn(),
  onUploaded: vi.fn(),
  onUseAccountReference: vi.fn(),
  tabs: [
    { id: 'media' as const, label: 'Library' },
    { id: 'references' as const, label: 'Branding' },
  ],
};

describe('ModalGalleryHeader', () => {
  it('offers the Library and the brand references for an image', () => {
    render(<ModalGalleryHeader {...defaultProps} />);

    expect(screen.getByRole('tab', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Branding' })).toBeInTheDocument();
  });

  it('shows no tabs for a video, only the upload', () => {
    render(
      <ModalGalleryHeader
        {...defaultProps}
        category={IngredientCategory.VIDEO}
        tabs={[]}
      />,
    );

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('uploads the picker category and refreshes the grid when done', () => {
    render(
      <ModalGalleryHeader
        {...defaultProps}
        category={IngredientCategory.VIDEO}
        tabs={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(uploads.openUpload).toHaveBeenCalledWith({
      category: IngredientCategory.VIDEO,
    });
    expect(uploads.options.onComplete).toBe(defaultProps.onUploaded);
  });

  it('offers the account reference when the caller passes one', () => {
    render(
      <ModalGalleryHeader
        {...defaultProps}
        accountReference={{ id: 'ref-1', url: '/ref.png' } as IAsset}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Use account reference' }),
    ).toBeInTheDocument();
  });

  it('renders nothing above a music list', () => {
    const { container } = render(
      <ModalGalleryHeader
        {...defaultProps}
        category={IngredientCategory.MUSIC}
        tabs={[]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
