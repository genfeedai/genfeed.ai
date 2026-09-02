import {
  IngredientCategory,
  IngredientStatus,
  ViewType,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioGenerateAssetActions } from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateCard from '@pages/studio/generate/components/StudioGenerateCard';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const masonryMocks = vi.hoisted(() => ({
  image: vi.fn(),
  video: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('next/image', () => ({
  default: ({ alt, onError, src }: React.ComponentProps<'img'>) => (
    <img alt={alt} onError={onError} src={String(src)} />
  ),
}));

vi.mock('@ui/lazy/masonry/LazyMasonry', () => ({
  LazyMasonryImage: (props: Record<string, unknown>) => {
    masonryMocks.image(props);
    return <div data-testid="shared-masonry-image" />;
  },
  LazyMasonryVideo: (props: Record<string, unknown>) => {
    masonryMocks.video(props);
    return <div data-testid="shared-masonry-video" />;
  },
}));

function buildAssetActions(): StudioGenerateAssetActions {
  return {
    onClickIngredient: vi.fn(),
    onConvertToVideo: vi.fn(),
    onCopyPrompt: vi.fn(),
    onCreateVariation: vi.fn(),
    onDeleteIngredient: vi.fn(),
    onMarkArchived: vi.fn(),
    onMarkRejected: vi.fn(),
    onMarkValidated: vi.fn(),
    onPublishIngredient: vi.fn(),
    onRefresh: vi.fn(),
    onRemoveGeneration: vi.fn(),
    onSeeDetails: vi.fn(),
    onToggleFavorite: vi.fn(),
    onUseAsVideoReference: vi.fn(),
  };
}

const generatedJob = {
  createdAt: 1,
  height: 1350,
  id: 'job-1',
  modelKey: 'flux-schnell',
  prompt: 'A boxer in black apparel',
  status: IngredientStatus.GENERATED,
  type: 'image' as const,
  url: 'https://cdn.example.com/image.png',
  width: 1080,
};

describe('StudioGenerateCard', () => {
  it('keeps grid metadata in a hover and focus layer over the asset', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <StudioGenerateCard
        assetActions={buildAssetActions()}
        job={generatedJob}
        onReprompt={vi.fn()}
        onSelect={onSelect}
        view={ViewType.GRID}
      />,
    );

    expect(screen.getByText(generatedJob.prompt)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(generatedJob.modelKey)),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-asset-details]')).toBeNull();
    expect(
      screen
        .getByText(generatedJob.prompt)
        .closest('[data-asset-hover-details]'),
    ).toHaveClass('absolute', 'opacity-0', 'group-hover:opacity-100');
    expect(container.querySelector('[data-asset-caption]')).toBeNull();
    expect(container.querySelector('[data-asset-footer]')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', {
        name: `Inspect Image generation: ${generatedJob.prompt}`,
      }),
    );

    expect(onSelect).toHaveBeenCalledWith(generatedJob);
  });

  it('replaces a broken image with the shared preview fallback', () => {
    render(
      <StudioGenerateCard
        assetActions={buildAssetActions()}
        job={generatedJob}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    fireEvent.error(screen.getByRole('img', { name: generatedJob.prompt }));

    expect(
      screen.queryByRole('img', { name: generatedJob.prompt }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('studio-asset-job-1')).toHaveAttribute(
      'data-asset-media-state',
      'fallback',
    );
  });

  it('shows the fallback immediately when a generated asset has no url', () => {
    render(
      <StudioGenerateCard
        assetActions={buildAssetActions()}
        job={{ ...generatedJob, url: undefined }}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('separates reprompting a failed generation from removing it', () => {
    const assetActions = buildAssetActions();
    const onReprompt = vi.fn();
    const job = {
      ...generatedJob,
      error: 'Generation failed',
      status: IngredientStatus.FAILED,
    };

    render(
      <StudioGenerateCard
        assetActions={assetActions}
        job={job}
        onReprompt={onReprompt}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: `Reprompt Image generation: ${job.prompt}`,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: `Remove Image generation: ${job.prompt}`,
      }),
    );

    expect(onReprompt).toHaveBeenCalledWith(job);
    expect(assetActions.onRemoveGeneration).toHaveBeenCalledWith(job);
  });

  it('reuses the behavior-rich masonry image for hydrated assets', () => {
    const ingredient = {
      category: IngredientCategory.IMAGE,
      id: generatedJob.id,
      promptText: generatedJob.prompt,
      status: IngredientStatus.GENERATED,
    } as IIngredient;
    const job = { ...generatedJob, ingredient };
    const assetActions = buildAssetActions();
    const onReprompt = vi.fn();

    render(
      <StudioGenerateCard
        assetActions={assetActions}
        job={job}
        onReprompt={onReprompt}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    expect(screen.getByTestId('shared-masonry-image')).toBeInTheDocument();
    expect(screen.getByText(generatedJob.prompt)).toBeInTheDocument();
    expect(
      screen
        .getByText(generatedJob.prompt)
        .closest('[data-asset-hover-details]'),
    ).toHaveClass('opacity-0', 'group-focus-within:opacity-100');

    const imageProps = masonryMocks.image.mock.calls.at(-1)?.[0] as {
      onCopyPrompt: StudioGenerateAssetActions['onCopyPrompt'];
      onMediaError: () => void;
      onReprompt: (ingredient: IIngredient) => void;
      onToggleFavorite: StudioGenerateAssetActions['onToggleFavorite'];
    };
    expect(imageProps.onCopyPrompt).toBe(assetActions.onCopyPrompt);
    expect(imageProps.onToggleFavorite).toBe(assetActions.onToggleFavorite);

    act(() => imageProps.onReprompt(ingredient));
    expect(onReprompt).toHaveBeenCalledWith(job);

    act(imageProps.onMediaError);
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('reuses the behavior-rich masonry video for hydrated clips', () => {
    const ingredient = {
      category: IngredientCategory.VIDEO,
      id: generatedJob.id,
      promptText: generatedJob.prompt,
      status: IngredientStatus.GENERATED,
    } as IIngredient;

    render(
      <StudioGenerateCard
        assetActions={buildAssetActions()}
        job={{
          ...generatedJob,
          ingredient,
          type: 'video',
          url: 'https://cdn.example.com/video.mp4',
        }}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    expect(screen.getByTestId('shared-masonry-video')).toBeInTheDocument();
  });

  it('selects a card so the inspector can open', () => {
    const onSelect = vi.fn();
    const job = {
      ...generatedJob,
      status: IngredientStatus.PROCESSING,
      url: undefined,
    };

    render(
      <StudioGenerateCard
        assetActions={buildAssetActions()}
        job={job}
        onReprompt={vi.fn()}
        onSelect={onSelect}
        view={ViewType.GRID}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: `Inspect Image generation: ${job.prompt}`,
      }),
    );

    expect(onSelect).toHaveBeenCalledWith(job);
  });

  it('renders readable metadata beside the thumbnail in list view', () => {
    render(
      <StudioGenerateCard
        assetActions={buildAssetActions()}
        job={generatedJob}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.LIST}
      />,
    );

    expect(screen.getByText(generatedJob.prompt)).toHaveClass(
      'text-foreground',
    );
    expect(screen.getByText(generatedJob.prompt)).not.toHaveClass(
      'line-clamp-3',
    );
    expect(screen.getByTestId('studio-asset-job-1')).toHaveClass('grid');
    expect(
      screen.getByText(generatedJob.prompt).closest('[data-asset-caption]'),
    ).toBeNull();
  });
});
