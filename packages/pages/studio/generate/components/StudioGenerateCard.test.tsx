import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import type { StudioGenerateAssetActions } from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateCard from '@pages/studio/generate/components/StudioGenerateCard';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const masonryMocks = vi.hoisted(() => ({
  image: vi.fn(),
  video: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

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
  it('keeps asset details in the media hover overlay', () => {
    const { container } = render(
      <StudioGenerateCard
        assetActions={buildAssetActions()}
        job={generatedJob}
        onReprompt={vi.fn()}
      />,
    );

    expect(screen.getByText(generatedJob.prompt)).toBeInTheDocument();
    expect(screen.getByText(generatedJob.modelKey)).toBeInTheDocument();
    expect(
      screen.getByText(generatedJob.prompt).closest('[data-asset-details]'),
    ).toHaveClass('absolute');
    expect(container.querySelector('[data-asset-footer]')).toBeNull();
  });

  it('replaces a broken image with the shared preview fallback', () => {
    render(
      <StudioGenerateCard
        assetActions={buildAssetActions()}
        job={generatedJob}
        onReprompt={vi.fn()}
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
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('labels a failed generation retry consistently', () => {
    render(
      <StudioGenerateCard
        assetActions={buildAssetActions()}
        job={{
          ...generatedJob,
          error: 'Generation failed',
          status: IngredientStatus.FAILED,
        }}
        onReprompt={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reprompt' }),
    ).not.toBeInTheDocument();
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
      />,
    );

    expect(screen.getByTestId('shared-masonry-image')).toBeInTheDocument();
    expect(screen.getByText(generatedJob.prompt)).toBeInTheDocument();
    expect(
      screen.getByText(generatedJob.prompt).closest('[data-asset-details]'),
    ).toHaveClass('absolute');

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
      />,
    );

    expect(screen.getByTestId('shared-masonry-video')).toBeInTheDocument();
  });
});
