import '@testing-library/jest-dom/vitest';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({
    alt,
    loading,
    src,
    unoptimized,
  }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    // biome-ignore lint/performance/noImgElement: test stub for next/image
    <img
      alt={alt}
      data-loading={loading}
      data-unoptimized={unoptimized ? 'true' : 'false'}
      src={src}
    />
  ),
}));

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({
    config,
    src,
  }: {
    config: { autoPlay: boolean; preload: string };
    src: string;
  }) => (
    <div
      data-autoplay={String(config.autoPlay)}
      data-preload={config.preload}
      data-testid="video-preview"
    >
      {src}
    </div>
  ),
}));

import LibrarySourcePreview from './LibrarySourcePreview';

function ingredient(
  category: IngredientCategory,
  ingredientUrl?: string,
): IIngredient {
  return {
    category,
    id: `${category}-1`,
    ingredientUrl,
    // Category values are SCREAMING enum labels; keep the fixture label
    // human-cased like real metadata labels.
    metadataLabel: `${category.toLowerCase()} source`,
  } as IIngredient;
}

describe('LibrarySourcePreview', () => {
  it('loads image media lazily', () => {
    render(
      <LibrarySourcePreview
        record={ingredient(
          IngredientCategory.IMAGE,
          'https://cdn.example/image.jpg',
        )}
      />,
    );

    expect(screen.getByRole('img', { name: 'image source' })).toHaveAttribute(
      'data-loading',
      'lazy',
    );
  });

  it('preloads video metadata without autoplay', () => {
    render(
      <LibrarySourcePreview
        record={ingredient(
          IngredientCategory.VIDEO,
          'https://cdn.example/video.mp4',
        )}
      />,
    );

    expect(screen.getByTestId('video-preview')).toHaveAttribute(
      'data-autoplay',
      'false',
    );
    expect(screen.getByTestId('video-preview')).toHaveAttribute(
      'data-preload',
      'metadata',
    );
  });

  it('bypasses the Next optimizer for leftover files-host URLs', () => {
    render(
      <LibrarySourcePreview
        record={ingredient(
          IngredientCategory.IMAGE,
          `https://files.genfeed.localhost/local/ingredients/images/${testId('ingredient')}`,
        )}
      />,
    );

    expect(screen.getByRole('img', { name: 'image source' })).toHaveAttribute(
      'data-unoptimized',
      'true',
    );
  });

  it('renders an accessible fallback when media is missing', () => {
    render(
      <LibrarySourcePreview record={ingredient(IngredientCategory.GIF)} />,
    );

    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });
});
