import { IngredientCategory, IngredientOrigin } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientInspectorRail from './IngredientInspectorRail';

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: (ingredient: IIngredient) =>
    ingredient.mediaDelivery ?? null,
}));

vi.mock('@ui/quick-actions/actions/IngredientQuickActions', () => ({
  default: () => null,
}));

vi.mock('./IngredientTagsControl', () => ({
  default: ({ ingredient }: { ingredient: { id: string } }) => (
    <div data-testid="tags-control">{ingredient.id}</div>
  ),
}));

vi.mock('./IngredientLineageStrip', () => ({
  default: ({
    direction,
    ingredientId,
  }: {
    direction: string;
    ingredientId: string;
  }) => <div data-testid={`lineage-${direction}`}>{ingredientId}</div>,
}));

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
  it('uses the refreshed authorized preview and keeps pending originals hidden', () => {
    const { rerender } = render(
      <IngredientInspectorRail
        ingredient={{
          ...ingredient,
          mediaDelivery: {
            id: 'asset-1',
            state: 'READY',
            purpose: 'preview',
            url: 'https://media.test/protected-fresh',
            expiresAt: '2026-10-03T01:00:00Z',
          },
        }}
      />,
    );
    expect(screen.getByRole('img').getAttribute('src')).toBe(
      'https://media.test/protected-fresh',
    );
    rerender(
      <IngredientInspectorRail
        ingredient={{
          ...ingredient,
          mediaDelivery: {
            id: 'asset-1',
            state: 'PENDING',
            purpose: 'preview',
            url: null,
            expiresAt: null,
          },
        }}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('shows the complete selectable prompt with whitespace and unbroken text preserved', () => {
    const prompt = `${'A detailed prompt line.\n'.repeat(12)}\n${'longword'.repeat(80)}`;
    render(
      <IngredientInspectorRail
        ingredient={{ ...ingredient, promptText: prompt }}
      />,
    );
    const note = screen.getByText(
      (_, element) =>
        element?.tagName === 'P' && element.textContent === prompt,
    );
    expect(note.textContent).toBe(prompt);
    expect(note).toHaveClass(
      'whitespace-pre-wrap',
      'break-words',
      'select-text',
    );
    expect(note).not.toHaveClass('line-clamp-6');
  });

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
    expect(
      screen.getByRole('slider', { name: 'Seek video' }),
    ).toBeInTheDocument();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue();
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    expect(play).toHaveBeenCalledOnce();
    play.mockRestore();
    expect(player).not.toHaveAttribute('autoplay');
  });
  it('opens the lightbox from the preview only when a handler is given', () => {
    const onOpenPreview = vi.fn();
    const { rerender } = render(
      <IngredientInspectorRail ingredient={ingredient} />,
    );
    expect(
      screen.queryByRole('button', { name: 'Open full-size preview' }),
    ).not.toBeInTheDocument();

    rerender(
      <IngredientInspectorRail
        ingredient={ingredient}
        onOpenPreview={onOpenPreview}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Open full-size preview' }),
    );
    expect(onOpenPreview).toHaveBeenCalledOnce();
  });

  it('puts the tag control for this asset in the detail panel', () => {
    render(<IngredientInspectorRail ingredient={ingredient} />);

    expect(screen.getByTestId('tags-control')).toHaveTextContent('asset-1');
  });

  it('shows the references it was made from and where it was used', () => {
    render(<IngredientInspectorRail ingredient={ingredient} />);

    expect(screen.getByTestId('lineage-made-from')).toHaveTextContent(
      'asset-1',
    );
    expect(screen.getByTestId('lineage-used-in')).toHaveTextContent('asset-1');
  });

  it.each([
    [IngredientOrigin.UPLOADED, 'Uploaded'],
    [IngredientOrigin.GENERATED, 'Generated'],
    [IngredientOrigin.IMPORTED, 'Imported'],
  ])('labels a %s asset in the detail panel', (origin, label) => {
    render(<IngredientInspectorRail ingredient={{ ...ingredient, origin }} />);

    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('omits the origin row when the asset carries none', () => {
    render(<IngredientInspectorRail ingredient={ingredient} />);

    expect(screen.queryByText('Origin')).not.toBeInTheDocument();
  });
});
