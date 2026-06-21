import '@testing-library/jest-dom/vitest';
import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MediaAssetNode } from '@/features/moodboard/MediaAssetNode';
import type { MediaAssetNodeProps } from '@/features/moodboard/moodboard.types';

vi.mock('next/image', () => ({
  default: ({
    alt = '',
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/performance/noImgElement: test stub for next/image
    <img alt={alt} {...props} />
  ),
}));

function renderNode(ingredient: IIngredient) {
  const props = { data: { ingredient } } as unknown as MediaAssetNodeProps;
  return render(<MediaAssetNode {...props} />);
}

describe('MediaAssetNode', () => {
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
    expect(screen.queryByTestId('moodboard-play-badge')).toBeNull();
  });

  it('renders a video poster with a play badge', () => {
    renderNode({
      id: 'vid-1',
      category: IngredientCategory.VIDEO,
      ingredientUrl: 'https://cdn/vid-1.mp4',
      thumbnailUrl: 'https://cdn/vid-1.jpg',
    } as IIngredient);

    expect(screen.getByTestId('moodboard-play-badge')).toBeInTheDocument();
    // Video tiles show the poster (thumbnailUrl), not the raw media.
    expect(screen.getByAltText('asset')).toHaveAttribute(
      'src',
      'https://cdn/vid-1.jpg',
    );
  });
});
