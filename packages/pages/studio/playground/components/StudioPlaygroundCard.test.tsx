import {
  IngredientCategory,
  IngredientStatus,
  ViewType,
} from '@genfeedai/contracts';
import type { IImage, IVideo } from '@genfeedai/contracts/interfaces';
import type {
  MasonryImageProps,
  MasonryVideoProps,
} from '@genfeedai/props/content/masonry.props';
import type { StudioPlaygroundAssetActions } from '@genfeedai/props/studio/studio-playground.props';
import StudioPlaygroundCard from '@pages/studio/playground/components/StudioPlaygroundCard';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AudioPreviewPlayerProps } from '@ui/audio/preview-player/AudioPreviewPlayer';
import { describe, expect, it, vi } from 'vitest';

const masonryMocks = vi.hoisted(() => ({
  image: vi.fn<(props: MasonryImageProps) => void>(),
  video: vi.fn<(props: MasonryVideoProps) => void>(),
  audio: vi.fn<(props: AudioPreviewPlayerProps) => void>(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/my-org/my-brand${path}` }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, onError, src }: React.ComponentProps<'img'>) => (
    <img alt={alt} onError={onError} src={String(src)} />
  ),
}));

vi.mock('@ui/audio/preview-player/AudioPreviewPlayer', () => ({
  default: (props: AudioPreviewPlayerProps) => {
    masonryMocks.audio(props);
    return (
      <button type="button" data-testid="shared-audio-player">
        Play audio
      </button>
    );
  },
}));

vi.mock('@ui/lazy/masonry/LazyMasonry', () => ({
  LazyMasonryImage: (props: MasonryImageProps) => {
    masonryMocks.image(props);
    return <div data-testid="shared-masonry-image" />;
  },
  LazyMasonryVideo: (props: MasonryVideoProps) => {
    masonryMocks.video(props);
    return <div data-testid="shared-masonry-video" />;
  },
}));

function buildAssetActions(): StudioPlaygroundAssetActions {
  return {
    onClickIngredient: vi.fn(),
    onConvertToVideo: vi.fn(),
    onCopyPrompt: vi.fn(),
    onCreateVariation: vi.fn(),
    onDeleteIngredient: vi.fn(),
    onMarkArchived: vi.fn(),
    onMarkRejected: vi.fn(),
    onMarkValidated: vi.fn(),
    onOpenInEditor: vi.fn(),
    onPublishIngredient: vi.fn(),
    onRefresh: vi.fn(),
    onRemoveGeneration: vi.fn(),
    onResize: vi.fn(),
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
  recipe: {
    blacklist: [],
    isAudioEnabled: false,
    originalText: 'A boxer in black apparel',
    outputs: 1,
    references: [],
    tags: [],
    text: 'A boxer in black apparel',
    type: 'image' as const,
  },
  status: IngredientStatus.GENERATED,
  type: 'image' as const,
  url: 'https://cdn.example.com/image.png',
  width: 1080,
};

describe('StudioPlaygroundCard', () => {
  it('names assets and reference actions from recorded intent without changing the provider request', () => {
    const onUseAsReference = vi.fn();
    const job = {
      ...generatedJob,
      prompt: 'Brand enrichment and provider instructions '.repeat(30),
    };
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={job}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        onUseAsReference={onUseAsReference}
        view={ViewType.GRID}
      />,
    );
    const props = masonryMocks.image.mock.calls.at(-1)?.[0];
    expect(props?.accessibleLabel).toBe(generatedJob.recipe.originalText);
    expect(props?.image.promptText).toBe(job.prompt);
    fireEvent.click(
      screen.getByRole('button', {
        name: `Use this image as a reference: ${generatedJob.recipe.originalText}`,
      }),
    );
    expect(onUseAsReference).toHaveBeenCalledWith(job);
  });

  it('uses asset identity when a legacy row has no recorded original intent', () => {
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={{
          ...generatedJob,
          recipe: undefined,
          prompt: 'Unrecorded enrichment '.repeat(30),
        }}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );
    expect(masonryMocks.image.mock.calls.at(-1)?.[0].accessibleLabel).toBe(
      'Image job-1',
    );
  });

  it('bounds long recorded asset names without truncating the stored intent', () => {
    const originalText = 'A detailed user description '.repeat(10);
    const job = {
      ...generatedJob,
      recipe: { ...generatedJob.recipe, originalText },
    };
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={job}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );
    expect(masonryMocks.image.mock.calls.at(-1)?.[0].accessibleLabel).toBe(
      `${originalText.slice(0, 99)}…`,
    );
    expect(job.recipe.originalText).toBe(originalText);
  });

  it('keeps grid metadata and actions without a prompt caption', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={generatedJob}
        onReprompt={vi.fn()}
        onSelect={onSelect}
        view={ViewType.GRID}
      />,
    );

    expect(screen.queryByText(generatedJob.prompt)).not.toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(generatedJob.modelKey)),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-asset-details]')).toBeNull();
    expect(container.querySelector('[data-asset-hover-details]')).toHaveClass(
      'absolute',
      'opacity-0',
      'group-hover:opacity-100',
    );
    expect(
      container.querySelector('[data-asset-hover-details]'),
    ).not.toHaveClass('border-t');
    expect(container.querySelector('[data-asset-caption]')).toBeNull();
    expect(container.querySelector('[data-asset-footer]')).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: `Inspect Image generation: ${generatedJob.prompt}`,
      }),
    ).toBeNull();

    fireEvent.click(screen.getByTestId('studio-asset-job-1'));

    expect(onSelect).toHaveBeenCalledWith(generatedJob);
  });

  it('sets a ready asset as a reference from the hover layer', () => {
    const onUseAsReference = vi.fn();
    const onSelect = vi.fn();
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={generatedJob}
        onReprompt={vi.fn()}
        onSelect={onSelect}
        onUseAsReference={onUseAsReference}
        view={ViewType.GRID}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: `Use this image as a reference: ${generatedJob.prompt}`,
      }),
    );

    expect(onUseAsReference).toHaveBeenCalledWith(generatedJob);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('hides use-as-reference when the open composer cannot accept the asset', () => {
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        isUseAsReferenceEnabled={false}
        job={{ ...generatedJob, type: 'video' }}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        onUseAsReference={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    expect(screen.queryByTestId('studio-asset-reference-job-1')).toBeNull();
  });

  it('replaces a broken image with the shared preview fallback', () => {
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={generatedJob}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    const props = masonryMocks.image.mock.calls.at(-1)?.[0];
    act(() => props?.onMediaError?.());

    expect(
      screen.queryByRole('img', { name: generatedJob.prompt }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('studio-asset-job-1')).toHaveAttribute(
      'data-asset-media-state',
      'fallback',
    );
  });

  it('leaves the preview fallback after a successful Inspector retry and reauthorizes the tile', () => {
    const props = {
      assetActions: buildAssetActions(),
      job: generatedJob,
      onReprompt: vi.fn(),
      onSelect: vi.fn(),
      view: ViewType.GRID,
    } as const;
    const { rerender } = render(<StudioPlaygroundCard {...props} />);
    expect(masonryMocks.image.mock.calls.at(-1)?.[0].previewRetryRevision).toBe(
      0,
    );
    act(() => masonryMocks.image.mock.calls.at(-1)?.[0].onMediaError?.());
    expect(screen.getByTestId('studio-asset-job-1')).toHaveAttribute(
      'data-asset-media-state',
      'fallback',
    );
    masonryMocks.image.mockClear();

    // The Inspector's retry loaded the same saved asset: the card follows.
    rerender(<StudioPlaygroundCard {...props} previewRevision={1} />);

    expect(screen.getByTestId('studio-asset-job-1')).toHaveAttribute(
      'data-asset-media-state',
      'ready',
    );
    expect(screen.queryByText('Preview unavailable')).not.toBeInTheDocument();
    expect(masonryMocks.image.mock.calls.at(-1)?.[0].previewRetryRevision).toBe(
      1,
    );

    // A failure under the new revision is still reported, not masked.
    act(() => masonryMocks.image.mock.calls.at(-1)?.[0].onMediaError?.());
    expect(screen.getByTestId('studio-asset-job-1')).toHaveAttribute(
      'data-asset-media-state',
      'fallback',
    );
  });

  it('shows the fallback immediately when a generated asset has no url', () => {
    render(
      <StudioPlaygroundCard
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
      <StudioPlaygroundCard
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
    } as IImage;
    const job = { ...generatedJob, ingredient };
    const assetActions = buildAssetActions();
    const onReprompt = vi.fn();

    render(
      <StudioPlaygroundCard
        assetActions={assetActions}
        job={job}
        onReprompt={onReprompt}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    expect(screen.getByTestId('shared-masonry-image')).toBeInTheDocument();
    expect(screen.queryByText(generatedJob.prompt)).not.toBeInTheDocument();
    expect(
      screen
        .getByText(new RegExp(generatedJob.modelKey))
        .closest('[data-asset-hover-details]'),
    ).toHaveClass('opacity-0', 'group-focus-within:opacity-100');

    const imageProps = masonryMocks.image.mock.calls.at(-1)?.[0];
    expect(imageProps?.onCopyPrompt).toBe(assetActions.onCopyPrompt);
    expect(imageProps?.onToggleFavorite).toBe(assetActions.onToggleFavorite);

    act(() => imageProps?.onReprompt?.(ingredient));
    expect(onReprompt).toHaveBeenCalledWith(job);

    act(() => imageProps?.onMediaError?.());
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('reuses the behavior-rich masonry video for hydrated clips', () => {
    const ingredient = {
      category: IngredientCategory.VIDEO,
      id: generatedJob.id,
      promptText: generatedJob.prompt,
      status: IngredientStatus.GENERATED,
    } as IVideo;

    render(
      <StudioPlaygroundCard
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

  it('hands hydrated video results the Library video transformations plus editor and resize', () => {
    const assetActions = buildAssetActions();
    const ingredient = {
      category: IngredientCategory.VIDEO,
      id: generatedJob.id,
      promptText: generatedJob.prompt,
      status: IngredientStatus.GENERATED,
    } as IVideo;

    render(
      <StudioPlaygroundCard
        assetActions={assetActions}
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

    const props = masonryMocks.video.mock.calls.at(-1)?.[0];
    // Extend, upscale, reframe and GIF stay owned by the masonry itself; the
    // card only opts into the Studio-specific handoffs.
    expect(props?.isActionsEnabled).toBe(true);
    expect(props?.onOpenInEditor).toBe(assetActions.onOpenInEditor);
    expect(props?.onResize).toBe(assetActions.onResize);
    const makeClips = screen.getByRole('link', { name: 'Make clips' });
    expect(makeClips).toHaveAttribute(
      'href',
      `/my-org/my-brand/studio/clips/new?video=${ingredient.id}`,
    );
  });

  it('keeps video transformations off until the clip is a persisted asset', () => {
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={{
          ...generatedJob,
          type: 'video',
          url: 'https://cdn.example.com/video.mp4',
        }}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );

    expect(masonryMocks.video.mock.calls.at(-1)?.[0].isActionsEnabled).toBe(
      false,
    );
    expect(
      screen.queryByRole('link', { name: 'Make clips' }),
    ).not.toBeInTheDocument();
  });

  it('links a transformation to its source with a keyboard-operable control', () => {
    const onSelect = vi.fn();
    const parentJob = {
      ...generatedJob,
      id: 'source-job',
      ingredientId: 'source-1',
      type: 'video' as const,
    };
    const job = {
      ...generatedJob,
      id: 'upscaled-job',
      ingredient: {
        category: IngredientCategory.VIDEO,
        id: 'upscaled-1',
        parentId: 'source-1',
        status: IngredientStatus.GENERATED,
      } as IVideo,
      parentId: 'source-1',
      type: 'video' as const,
      url: 'https://cdn.example.com/upscaled.mp4',
    };

    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={job}
        onReprompt={vi.fn()}
        onSelect={onSelect}
        parentJob={parentJob}
        view={ViewType.GRID}
      />,
    );

    const sourceLink = screen.getByRole('button', {
      name: 'Show the source of this video',
    });
    expect(sourceLink.tagName).toBe('BUTTON');
    fireEvent.click(sourceLink);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(parentJob);
  });

  it('shows no source link when the parent is not in the gallery', () => {
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={{ ...generatedJob, parentId: 'missing-source' }}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.LIST}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Show the source/ }),
    ).toBeNull();
  });

  it.each(['image', 'video'] as const)(
    'uses masonry for %s URLs before ingredient hydration',
    (type) => {
      render(
        <StudioPlaygroundCard
          assetActions={buildAssetActions()}
          job={{ ...generatedJob, type }}
          onReprompt={vi.fn()}
          onSelect={vi.fn()}
          view={ViewType.GRID}
        />,
      );
      expect(screen.getByTestId(`shared-masonry-${type}`)).toBeInTheDocument();
      const props = masonryMocks[type].mock.calls.at(-1)?.[0];
      const media =
        type === 'image'
          ? masonryMocks.image.mock.calls.at(-1)?.[0].image
          : masonryMocks.video.mock.calls.at(-1)?.[0].video;
      expect(props?.isActionsEnabled).toBe(false);
      expect(media).toMatchObject({
        id: generatedJob.id,
        cdnUrl: generatedJob.url,
      });
    },
  );

  it('reports video errors through the shared fallback before hydration', () => {
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={{ ...generatedJob, type: 'video' }}
        onReprompt={vi.fn()}
        onSelect={vi.fn()}
        view={ViewType.GRID}
      />,
    );
    const props = masonryMocks.video.mock.calls.at(-1)?.[0];
    act(() => props?.onMediaError?.());
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('uses shared audio transport without selecting the generation when playing', () => {
    const onSelect = vi.fn();
    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={{ ...generatedJob, type: 'voice' }}
        onReprompt={vi.fn()}
        onSelect={onSelect}
        view={ViewType.GRID}
      />,
    );
    fireEvent.click(screen.getByTestId('shared-audio-player'));
    expect(onSelect).not.toHaveBeenCalled();
    const props = masonryMocks.audio.mock.calls.at(-1)?.[0];
    expect(props?.audioUrl).toBe(generatedJob.url);
    expect(props?.isTimelineVisible).toBe(true);
    act(() => props?.onError?.());
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('selects a card so the inspector can open', () => {
    const onSelect = vi.fn();
    const job = {
      ...generatedJob,
      status: IngredientStatus.PROCESSING,
      url: undefined,
    };

    render(
      <StudioPlaygroundCard
        assetActions={buildAssetActions()}
        job={job}
        onReprompt={vi.fn()}
        onSelect={onSelect}
        view={ViewType.GRID}
      />,
    );

    fireEvent.click(screen.getByTestId('studio-asset-job-1'));

    expect(onSelect).toHaveBeenCalledWith(job);
  });

  it('renders readable metadata beside the thumbnail in list view', () => {
    render(
      <StudioPlaygroundCard
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

describe('persisted failed Studio recovery', () => {
  for (const view of [ViewType.LIST, ViewType.GRID] as const) {
    it.each([
      ['503 Service unavailable', 'Retry', 'retry', false],
      ['Missing reference', 'Replace', 'review', false],
      ['Safety content blocked', 'Edit', 'review', false],
      ['422 Invalid input', 'Review', 'review', false],
      ['503 Service unavailable', 'Inspect', 'inspect', true],
    ])(
      `uses Library classification in ${view}: %s`,
      (error, label, action, ambiguous) => {
        const ingredient = {
          id: 'saved',
          brandId: 'brand',
          category: ambiguous
            ? IngredientCategory.VIDEO
            : IngredientCategory.IMAGE,
          status: IngredientStatus.FAILED,
          generationError: error,
          generationPrompt: 'Saved prompt',
          modelUsed: 'saved-model',
          ...(ambiguous ? { sources: ['reference'] } : {}),
        } as IImage | IVideo;
        const actions = buildAssetActions();
        actions.failedRecovery = {
          onRetryFailedIngredient: vi.fn(),
          onReviewFailedIngredient: vi.fn().mockResolvedValue(undefined),
          isRecovering: false,
          retriedIds: [],
        };
        render(
          <StudioPlaygroundCard
            assetActions={actions}
            job={{
              ...generatedJob,
              id: ingredient.id,
              ingredientId: ingredient.id,
              ingredient,
              status: IngredientStatus.FAILED,
            }}
            onReprompt={vi.fn()}
            onSelect={vi.fn()}
            view={view}
          />,
        );
        fireEvent.click(screen.getByRole('button', { name: label }));
        const callback =
          action === 'retry'
            ? actions.failedRecovery.onRetryFailedIngredient
            : action === 'inspect'
              ? actions.onSeeDetails
              : actions.failedRecovery.onReviewFailedIngredient;
        expect(callback).toHaveBeenCalledWith(ingredient);
        if (action !== 'retry') {
          expect(
            actions.failedRecovery.onRetryFailedIngredient,
          ).not.toHaveBeenCalled();
        }
        if (action !== 'review') {
          expect(
            actions.failedRecovery.onReviewFailedIngredient,
          ).not.toHaveBeenCalled();
        }
        if (action !== 'inspect') {
          expect(actions.onSeeDetails).not.toHaveBeenCalled();
        }
        expect(
          screen.getByRole('button', { name: /Remove/ }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Reprompt/ }),
        ).toBeInTheDocument();
      },
    );
    it(`disables Started action and keeps synthetic failures local in ${view}`, () => {
      const ingredient = {
        id: 'saved',
        brandId: 'brand',
        category: IngredientCategory.IMAGE,
        status: IngredientStatus.FAILED,
        generationError: '503 Service unavailable',
        generationPrompt: 'Saved prompt',
        modelUsed: 'saved-model',
      } as IImage;
      const actions = buildAssetActions();
      actions.failedRecovery = {
        onRetryFailedIngredient: vi.fn(),
        onReviewFailedIngredient: vi.fn().mockResolvedValue(undefined),
        isRecovering: true,
        retriedIds: ['saved'],
      };
      const { rerender } = render(
        <StudioPlaygroundCard
          assetActions={actions}
          job={{
            ...generatedJob,
            id: ingredient.id,
            ingredientId: ingredient.id,
            ingredient,
            status: IngredientStatus.FAILED,
          }}
          onReprompt={vi.fn()}
          onSelect={vi.fn()}
          view={view}
        />,
      );
      expect(screen.getByRole('button', { name: 'Started' })).toBeDisabled();
      rerender(
        <StudioPlaygroundCard
          assetActions={actions}
          job={{
            ...generatedJob,
            id: 'failed-local',
            status: IngredientStatus.FAILED,
          }}
          onReprompt={vi.fn()}
          onSelect={vi.fn()}
          view={view}
        />,
      );
      expect(screen.queryByRole('button', { name: 'Started' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });
  }
});
