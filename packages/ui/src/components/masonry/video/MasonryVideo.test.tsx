import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock hooks used by MasonryVideo
vi.mock(
  '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => ({
    default: () => ({
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
    }),
  }),
);

vi.mock('@genfeedai/hooks/media/video-utils/video.utils', () => ({
  stopAndResetVideo: vi.fn(),
}));

vi.mock('@genfeedai/utils/media/reference.util', () => ({
  resolveIngredientReferenceUrl: vi.fn(() => ''),
}));

vi.mock('@ui/masonry/shared/MasonryBrandLogo', () => ({
  default: () => <div data-testid="brand-logo" />,
}));

vi.mock('@ui/masonry/shared/MasonryConfirmBridge', () => ({
  default: () => null,
}));

vi.mock('@ui/quick-actions/actions/IngredientQuickActions', () => ({
  default: () => <div data-testid="quick-actions" />,
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

const mockVideoPlayer = vi.fn(() => <div data-testid="video-player" />);
vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: (props: unknown) => mockVideoPlayer(props),
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
  createDownloadHandler: () => vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

import { IngredientStatus } from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
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
  it('should prefer explicit thumbnails for video preview', () => {
    render(<MasonryVideo video={mockVideo} />);

    expect(mockVideoPlayer).toHaveBeenCalled();
    const firstCallProps = mockVideoPlayer.mock.calls[0]?.[0] as {
      thumbnail?: string;
    };
    expect(firstCallProps.thumbnail).toBe('https://example.com/thumb.jpg');
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
});
