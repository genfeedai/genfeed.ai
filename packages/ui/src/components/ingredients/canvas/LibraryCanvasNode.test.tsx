import '@testing-library/jest-dom/vitest';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LibraryCanvasNode } from './LibraryCanvasNode';
import type { LibraryCanvasNodeProps } from './library-canvas.types';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/image', () => ({
  default: ({
    alt = '',
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt} {...props} />,
}));

function renderNode(ingredient: IIngredient) {
  const props = { data: { ingredient } } as unknown as LibraryCanvasNodeProps;
  return render(<LibraryCanvasNode {...props} />);
}

describe('LibraryCanvasNode', () => {
  it('renders an image asset from its ingredientUrl without a play badge', () => {
    renderNode({
      id: 'img-1',
      category: IngredientCategory.IMAGE,
      ingredientUrl: 'https://cdn/img-1.png',
      metadataLabel: 'A sunset',
    } as IIngredient);

    expect(screen.getByAltText('A sunset')).toHaveAttribute(
      'src',
      'https://cdn/img-1.png',
    );
    expect(screen.queryByTestId('library-canvas-play-badge')).toBeNull();
  });

  it('renders a video poster with a play badge', () => {
    renderNode({
      id: 'vid-1',
      category: IngredientCategory.VIDEO,
      ingredientUrl: 'https://cdn/vid-1.mp4',
      thumbnailUrl: 'https://cdn/vid-1.jpg',
    } as IIngredient);

    expect(screen.getByTestId('library-canvas-play-badge')).toBeInTheDocument();
    // Video tiles show the poster (thumbnailUrl), not the raw media.
    expect(screen.getByAltText('asset')).toHaveAttribute(
      'src',
      'https://cdn/vid-1.jpg',
    );
  });

  it('swaps a broken preview for a quiet empty tile', () => {
    renderNode({
      id: 'img-2',
      category: IngredientCategory.IMAGE,
      ingredientUrl: 'https://cdn/missing.png',
      metadataLabel: 'Broken still',
    } as IIngredient);

    fireEvent.error(screen.getByAltText('Broken still'));

    expect(screen.queryByAltText('Broken still')).not.toBeInTheDocument();
    expect(screen.getByText('No preview')).toBeInTheDocument();
  });
});
