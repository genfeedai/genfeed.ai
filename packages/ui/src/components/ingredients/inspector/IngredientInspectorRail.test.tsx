import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IngredientInspectorRail from './IngredientInspectorRail';

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: (ingredient: IIngredient) =>
    ingredient.mediaDelivery ?? null,
}));

const openPostBatchModal = vi.fn();
const handleDownload = vi.fn();

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    usePostModal: () => ({ openPostBatchModal }),
  }),
);

vi.mock(
  '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => ({
    useIngredientActions: ({
      onPublishIngredient,
    }: {
      onPublishIngredient: (ingredient: IIngredient) => void;
    }) => ({
      handlers: {
        handleDownload,
        handlePublish: (ingredient: IIngredient) =>
          onPublishIngredient(ingredient),
      },
      loadingStates: { isDownloading: false, isPublishing: false },
    }),
  }),
);

vi.mock('@ui/quick-actions/actions/IngredientQuickActions', () => ({
  default: ({
    onDownload,
    onPublish,
    selectedIngredient,
  }: {
    onDownload?: (ingredient: IIngredient) => Promise<undefined>;
    onPublish?: (ingredient: IIngredient, platform: string) => void;
    selectedIngredient: IIngredient;
  }) => (
    <div>
      <input
        aria-label="publish-action"
        disabled={!onPublish}
        onClick={() => onPublish?.(selectedIngredient, 'auto')}
        type="checkbox"
      />
      <input
        aria-label="download-action"
        disabled={!onDownload}
        onClick={() => onDownload?.(selectedIngredient)}
        type="checkbox"
      />
    </div>
  ),
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
  it('shows the prompt right after the asset details, before tags', () => {
    render(
      <IngredientInspectorRail
        ingredient={{ ...ingredient, promptText: 'A red mug on a table' }}
      />,
    );

    const prompt = screen.getByRole('region', { name: 'Prompt' });
    expect(prompt).toHaveTextContent('A red mug on a table');
    expect(
      prompt.compareDocumentPosition(screen.getByTestId('tags-control')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  it('shows what produced a generated asset and its file details', () => {
    render(
      <IngredientInspectorRail
        ingredient={{
          ...ingredient,
          fileSize: 2_400_000,
          generationPrompt: 'A red mug on a desk',
          metadata: {
            createdAt: '2026-10-04T00:00:00.000Z',
            extension: 'png',
            height: 768,
            id: 'metadata-1',
            isDeleted: false,
            label: 'Apple',
            updatedAt: '2026-10-04T00:00:00.000Z',
            width: 1024,
          },
          modelUsed: 'black-forest-labs/flux-schnell',
          provider: 'replicate',
          style: 'cinematic',
        }}
      />,
    );

    const row = (label: string) =>
      screen.getByText(label).closest('div')?.querySelector('dd');

    expect(row('Model')).toHaveTextContent('black-forest-labs/flux-schnell');
    expect(row('Provider')).toHaveTextContent('replicate');
    expect(row('Style')).toHaveTextContent('cinematic');
    expect(row('Dimensions')).toHaveTextContent('1024 × 768');
    expect(row('Format')).toHaveTextContent('PNG');
    expect(row('File size')).toHaveTextContent('2.3 MB');
    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.getByText('A red mug on a desk')).toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
  });

  it('explains why a failed generation failed', () => {
    render(
      <IngredientInspectorRail
        ingredient={{
          ...ingredient,
          generationError: 'Provider rejected the prompt',
          status: IngredientStatus.FAILED,
        }}
      />,
    );

    expect(screen.getByText('Why it failed')).toBeInTheDocument();
    expect(screen.getByText('Provider rejected the prompt')).toHaveClass(
      'text-destructive',
    );
  });

  it('publishes and downloads the inspected asset from its quick actions', () => {
    render(<IngredientInspectorRail ingredient={ingredient} />);

    const publish = screen.getByRole('checkbox', { name: 'publish-action' });
    const download = screen.getByRole('checkbox', { name: 'download-action' });
    expect(publish).toBeEnabled();
    expect(download).toBeEnabled();

    fireEvent.click(publish);
    expect(openPostBatchModal).toHaveBeenCalledWith(ingredient);

    fireEvent.click(download);
    expect(handleDownload).toHaveBeenCalledWith(ingredient);
  });

  it('omits the origin row when the asset carries none', () => {
    render(<IngredientInspectorRail ingredient={ingredient} />);

    expect(screen.queryByText('Origin')).not.toBeInTheDocument();
  });
});
