import { fireEvent, render } from '@testing-library/react';
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

vi.mock('@ui/masonry/shared/MasonryBadgeOverlay', () => ({
  default: () => <div data-testid="badge-overlay" />,
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

import type { IVideo } from '@genfeedai/interfaces';
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
});
