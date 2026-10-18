import useIngredientActions from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import { fireEvent, render, screen } from '@testing-library/react';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import { describe, expect, it, vi } from 'vitest';

// Mock hooks used by MasonryVideo
vi.mock(
  '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => ({
    default: vi.fn(() => ({
      actionStates: {},
      clearEnhanceConfirm: vi.fn(),
      clearUpscaleConfirm: vi.fn(),
      enhanceConfirmData: null,
      executeEnhance: vi.fn(),
      executeUpscale: vi.fn(),
      handlers: {
        handleClone: vi.fn(),
        handleConvertToGif: vi.fn(),
        handleDelete: vi.fn(),
        handleLandscape: vi.fn(),
        handleMarkArchived: vi.fn(),
        handleMirror: vi.fn(),
        handlePortrait: vi.fn(),
        handlePublish: vi.fn(),
        handleReverse: vi.fn(),
        handleSquare: vi.fn(),
        handleUpscale: vi.fn(),
      },
      upscaleConfirmData: null,
    })),
  }),
);

vi.mock('@genfeedai/hooks/media/video-utils/video.utils', () => ({
  stopAndResetVideo: vi.fn(),
}));

vi.mock('@genfeedai/utils/media/reference.util', () => ({
  resolveIngredientReferenceUrl: vi.fn(() => ''),
}));

// Wrap the real preview hook so a test can see the retry revision it receives.
vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', async (load) => {
  const actual =
    await load<
      typeof import('@genfeedai/hooks/media/use-authorized-media-preview')
    >();
  return { useAuthorizedMediaPreview: vi.fn(actual.useAuthorizedMediaPreview) };
});

vi.mock('@ui/masonry/shared/MasonryBrandLogo', () => ({
  default: () => <div data-testid="brand-logo" />,
}));

vi.mock('@ui/masonry/shared/MasonryConfirmBridge', () => ({
  default: vi.fn(() => null),
}));

vi.mock('@ui/quick-actions/actions/IngredientQuickActions', () => ({
  default: vi.fn(() => <div data-testid="quick-actions" />),
}));

vi.mock('@ui/drag-drop/draggable/DraggableIngredient', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/drag-drop/zone-ingredient/DropZoneIngredient', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/dropdowns/status/DropdownStatus', () => ({
  default: () => <div data-testid="dropdown-status" />,
}));

type VideoPlayerCall = {
  className?: string;
  config?: { preload?: string };
  thumbnail?: string;
};
const mockVideoPlayer = vi.fn((_props: VideoPlayerCall) => (
  <div data-testid="video-player" />
));
vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: (props: VideoPlayerCall) => mockVideoPlayer(props),
}));

const writeIngredientTransferDataMock = vi.fn();
vi.mock('@ui/drag-drop/shared/ingredient-transfer', () => ({
  writeIngredientTransferData: (...args: unknown[]) =>
    writeIngredientTransferDataMock(...args),
}));

vi.mock('@genfeedai/services/core/environment.service', () => ({
  EnvironmentService: {
    assetsEndpoint: 'https://assets.test.com',
    cdnUrl: 'https://cdn.test.com',
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@ui/masonry/shared/useMasonryHover', () => ({
  useIngredientDownloadHandler: () => vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

import { IngredientStatus } from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import MasonryVideo from '@ui/masonry/video/MasonryVideo';

const mockVideo: IVideo = {
  aspectRatio: 'aspect-[9/16]',
  id: 'vid-123',
  ingredientUrl: 'https://example.com/video.mp4',
  metadata: { height: 1920, width: 1080 },
  references: [],
  status: 'active',
  thumbnailUrl: 'https://example.com/thumb.jpg',
} as unknown as IVideo;

describe('MasonryVideo', () => {
  it.each([false, true])(
    'binds controlled pending indicators to this source (matching: %s)',
    (isMatchingSource) => {
      const sourceId = isMatchingSource ? mockVideo.id : 'another-source';
      render(
        <MasonryVideo
          video={mockVideo}
          isSelected
          transformActions={{
            getAvailability: () => ({ isAvailable: true }),
            onUpscale: vi.fn(),
            onExtend: vi.fn(),
            isUpscaling: true,
            isExtending: true,
            upscalingSourceId: sourceId,
            extendingSourceId: sourceId,
          }}
        />,
      );
      const quickActions = vi
        .mocked(IngredientQuickActions)
        .mock.calls.at(-1)?.[0];
      expect(quickActions).toMatchObject({
        isUpscaling: isMatchingSource,
        isExtending: isMatchingSource,
      });
    },
  );

  it('forwards controlled transforms to the workspace owner and suppresses its leaf confirmation', () => {
    const factory = vi.mocked(useIngredientActions).getMockImplementation();
    if (!factory) throw new Error('Missing leaf action fixture');
    const local = factory({});
    vi.mocked(useIngredientActions).mockReturnValueOnce({
      ...local,
      upscaleConfirmData: {
        ingredient: mockVideo,
        cost: 10,
        modelKey: 'fixture-upscaler',
      },
      extendConfirmData: { ingredient: mockVideo, modelOptions: [] },
    });
    const onUpscale = vi.fn();
    const onExtend = vi.fn();
    const transformActions = {
      getAvailability: () => ({ isAvailable: true }),
      onUpscale,
      onExtend,
      isUpscaling: false,
      isExtending: false,
    };
    vi.mocked(IngredientQuickActions).mockImplementationOnce(
      ({ selectedIngredient, onUpscale, onExtend }) => (
        <>
          <button
            type="button"
            onClick={() => {
              if (selectedIngredient) onUpscale?.(selectedIngredient);
            }}
          >
            Shared upscale
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedIngredient) onExtend?.(selectedIngredient);
            }}
          >
            Shared extend
          </button>
        </>
      ),
    );
    render(
      <MasonryVideo
        video={mockVideo}
        isSelected
        transformActions={transformActions}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Shared upscale' }));
    expect(onUpscale).toHaveBeenCalledWith(mockVideo);
    expect(local.handlers.handleUpscale).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Shared extend' }));
    expect(onExtend).toHaveBeenCalledWith(mockVideo);
    expect(
      vi.mocked(MasonryConfirmBridge).mock.calls.at(-1)?.[0],
    ).toMatchObject({ upscaleConfirmData: null, extendConfirmData: null });
  });

  it('names the keyboard video action without using provider instructions', () => {
    const onClickIngredient = vi.fn();
    render(
      <MasonryVideo
        accessibleLabel="Recorded video intent"
        video={mockVideo}
        onClickIngredient={onClickIngredient}
      />,
    );
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Recorded video intent' }),
      { key: 'Enter' },
    );
    expect(onClickIngredient).toHaveBeenCalledWith(mockVideo);
  });

  it('reauthorizes its preview when the surface bumps the retry revision', () => {
    const { rerender } = render(<MasonryVideo video={mockVideo} />);
    expect(vi.mocked(useAuthorizedMediaPreview)).toHaveBeenLastCalledWith(
      mockVideo,
      0,
    );
    rerender(<MasonryVideo video={mockVideo} previewRetryRevision={2} />);
    expect(vi.mocked(useAuthorizedMediaPreview)).toHaveBeenLastCalledWith(
      mockVideo,
      2,
    );
  });

  it('should prefer explicit thumbnails for video preview', () => {
    render(<MasonryVideo video={mockVideo} />);

    expect(mockVideoPlayer).toHaveBeenCalled();
    const firstCallProps = mockVideoPlayer.mock.calls[0]?.[0] as {
      thumbnail?: string;
    };
    expect(firstCallProps.thumbnail).toBe('https://example.com/thumb.jpg');
  });

  it('leaves the video unloaded behind its poster until it plays', () => {
    render(<MasonryVideo video={mockVideo} />);

    expect(mockVideoPlayer.mock.calls[0]?.[0]?.config?.preload).toBe('none');
  });

  it('preloads metadata to show a first frame when no poster exists', () => {
    render(
      <MasonryVideo
        video={{ ...mockVideo, thumbnailUrl: undefined } as unknown as IVideo}
      />,
    );

    expect(mockVideoPlayer.mock.calls[0]?.[0]?.config?.preload).toBe(
      'metadata',
    );
  });

  it('preloads metadata when the only thumbnail is the generic placeholder', () => {
    render(
      <MasonryVideo
        video={
          {
            ...mockVideo,
            thumbnailUrl: 'https://assets.test.com/placeholders/portrait.jpg',
          } as unknown as IVideo
        }
      />,
    );

    expect(mockVideoPlayer.mock.calls[0]?.[0]?.config?.preload).toBe(
      'metadata',
    );
  });

  it('sizes the tile from the video metadata, not a 16:9 or 9:16 bucket', () => {
    render(
      <MasonryVideo
        video={
          {
            ...mockVideo,
            aspectRatio: 'aspect-[9/16]',
            metadata: { height: 1440, width: 1080 },
          } as unknown as IVideo
        }
      />,
    );

    const media = screen.getByTestId(`masonry-ingredient-${mockVideo.id}`);
    expect(media.style.aspectRatio).toBe('1080 / 1440');
    expect(media.closest('[data-masonry-item]')).not.toHaveClass(
      'aspect-[9/16]',
    );
  });

  it('should make the embedded video player ignore pointer events so the card remains draggable', () => {
    render(<MasonryVideo video={mockVideo} />);

    const firstCallProps = mockVideoPlayer.mock.calls[0]?.[0] as {
      className?: string;
    };

    expect(firstCallProps.className).toContain('pointer-events-none');
  });

  it('should make the visible video tile draggable and seed transfer data from that surface', () => {
    const { getByTestId } = render(
      <MasonryVideo video={mockVideo} onUpdateParent={vi.fn()} />,
    );

    const tile = getByTestId('masonry-ingredient-vid-123');
    expect(tile).toHaveAttribute('draggable', 'true');

    fireEvent.dragStart(tile, {
      dataTransfer: {
        effectAllowed: 'none',
      },
    });

    expect(writeIngredientTransferDataMock).toHaveBeenCalled();
  });

  it('shows the failure reason and a Retry control for a FAILED asset when onReprompt is provided', () => {
    const onReprompt = vi.fn();

    render(
      <MasonryVideo
        video={{
          ...mockVideo,
          generationError: 'Provider rejected the prompt.',
          status: IngredientStatus.FAILED,
        }}
        onReprompt={onReprompt}
      />,
    );

    const overlay = screen.getByTestId('asset-failure-overlay-vid-123');
    expect(overlay).toHaveTextContent('Provider rejected the prompt.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry generation' }));

    expect(onReprompt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'vid-123',
        status: IngredientStatus.FAILED,
      }),
    );
  });

  it('renders only the failure reason for a FAILED asset when onReprompt is not provided', () => {
    render(
      <MasonryVideo
        video={{
          ...mockVideo,
          generationError: 'Provider rejected the prompt.',
          status: IngredientStatus.FAILED,
        }}
      />,
    );

    expect(
      screen.getByTestId('asset-failure-reason-vid-123'),
    ).toHaveTextContent('Provider rejected the prompt.');
    expect(
      screen.queryByTestId('asset-failure-overlay-vid-123'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry generation' }),
    ).not.toBeInTheDocument();
  });

  it('renders neither the failure reason nor Retry for a non-failed asset', () => {
    const onReprompt = vi.fn();

    render(<MasonryVideo video={mockVideo} onReprompt={onReprompt} />);

    expect(
      screen.queryByTestId('asset-failure-overlay-vid-123'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('asset-failure-reason-vid-123'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry generation' }),
    ).not.toBeInTheDocument();
  });

  // Public galleries and profiles mount none of the app's providers, and the
  // actions hook reads them. A read-only tile must not call it.
  it('never calls the actions hook when actions are disabled', () => {
    vi.mocked(useIngredientActions).mockClear();

    render(<MasonryVideo video={mockVideo} isActionsEnabled={false} />);
    expect(useIngredientActions).not.toHaveBeenCalled();

    render(<MasonryVideo video={mockVideo} />);
    expect(useIngredientActions).toHaveBeenCalled();
  });
});
