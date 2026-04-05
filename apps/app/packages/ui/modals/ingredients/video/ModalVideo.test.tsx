import type { IVideo } from '@genfeedai/interfaces';
import { IngredientFormat } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import ModalVideo from '@ui/modals/ingredients/video/ModalVideo';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({ src }: { src?: string }) => (
    <div data-testid="video-player">{src}</div>
  ),
}));

describe('ModalVideo', () => {
  const availableVideos: IVideo[] = [
    {
      id: 'video-1',
      ingredientUrl: 'https://example.com/video.mp4',
      metadataLabel: 'Test Video',
    } as IVideo,
  ];

  const defaultProps = {
    availableVideos,
    format: IngredientFormat.PORTRAIT,
    isLoadingVideos: false,
    isOpen: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    selectedFrameIndex: null,
  };

  it('renders video modal when open', () => {
    render(<ModalVideo {...defaultProps} />);
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ModalVideo {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('video-player')).not.toBeInTheDocument();
  });
});
