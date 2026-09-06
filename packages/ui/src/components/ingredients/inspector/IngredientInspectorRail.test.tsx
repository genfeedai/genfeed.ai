import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientInspectorRail from './IngredientInspectorRail';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    className,
  }: {
    alt: string;
    src: string;
    className: string;
  }) => <img alt={alt} src={src} className={className} />,
}));
const ingredient = {
  category: IngredientCategory.IMAGE,
  id: 'asset-1',
  ingredientUrl: 'https://cdn.genfeed.ai/apple.jpg',
  metadataLabel: 'Apple',
} as IIngredient;

describe('IngredientInspectorRail', () => {
  it('contains the whole image in a bounded preview', () => {
    render(<IngredientInspectorRail ingredient={ingredient} />);
    expect(screen.getByRole('img', { name: 'Apple' })).toHaveClass(
      'object-contain',
    );
    expect(
      screen.getByRole('img', { name: 'Apple' }).parentElement,
    ).toHaveClass('h-[clamp(12rem,35dvh,24rem)]');
  });
  it('plays the selected video instead of rendering its URL as an image', () => {
    render(
      <IngredientInspectorRail
        ingredient={{
          ...ingredient,
          category: IngredientCategory.VIDEO,
          ingredientUrl: 'https://cdn.genfeed.ai/apple.mp4',
        }}
      />,
    );
    const player = screen.getByLabelText('Video player');
    expect(player).toHaveAttribute('src', 'https://cdn.genfeed.ai/apple.mp4');
    expect(player).toHaveAttribute('controls');
    expect(player).not.toHaveAttribute('autoplay');
  });
});
